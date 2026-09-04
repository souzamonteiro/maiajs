async function retainValue() {
  const marker = 'async local retained';
  console.log('async local start');
  await Promise.resolve(0);
  console.log(marker);
}

retainValue();
