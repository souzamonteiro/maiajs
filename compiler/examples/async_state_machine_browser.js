async function consume() {
  console.log('async start');
  await Promise.resolve(7);
  console.log('async resumed');
}

consume();
