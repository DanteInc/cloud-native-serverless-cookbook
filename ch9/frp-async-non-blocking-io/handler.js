const aws = require('aws-sdk');
const _ = require('highland');
const BbPromise = require('bluebird');

aws.config.setPromisesDependency(BbPromise);

module.exports.listener = (event, context, cb) => {
  console.log('event count: %s', event.Records.length);
  console.log('function timeout: %s', context.getRemainingTimeInMillis());

  _(event.Records)
    .map(recordToUow)
    .filter(forPurple)

    .ratelimit(Number(process.env.WRITE_CAPACITY) /
      Number(process.env.SHARD_COUNT) / 
      Number(process.env.PARALLEL) / 10, 100)
    .map(put)
    .parallel(Number(process.env.PARALLEL))

    .collect()
    .toCallback(cb);
};

const recordToUow = r => ({
  record: r,
  event: JSON.parse(new Buffer(r.kinesis.data, 'base64'))
});

const forPurple = uow => uow.event.type === 'purple';

const put = uow => {
  const params = {
    TableName: process.env.TABLE_NAME,
    Item: uow.event,
    ReturnConsumedCapacity: 'TOTAL',
  };

  const db = new aws.DynamoDB.DocumentClient({
    httpOptions: { timeout: 1000 },
    // default values:
    // maxRetries: 10,
    // retryDelayOptions: {
    //   base: 50,
    // },
    logger: console,
  });

  return _(db.put(params).promise()
    .tap(print)
    .then(() => uow)
  );
};

const print = v => console.log('%j', v);