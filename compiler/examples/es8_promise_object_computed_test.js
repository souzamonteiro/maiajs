const key = 'score';
const record = { id: 7, [key]: 22, state: 'ready' };

Promise.resolve(record).then(result => console.log(
  'es8 promise object: ' + result.id + ' ' + result.score + ' ' + result.state
));
