async function continueAfterAwait() {
  let count = 0;
  while (count < 2) {
    console.log('async continue before await');
    await tick();
    count = count + 1;
    continue;
  }
  console.log('async continue after loop');
}

continueAfterAwait();
