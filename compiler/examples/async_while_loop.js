async function repeat() {
  let count = 0;
  while (count < 2) {
    console.log('async while tick');
    await tick();
    console.log('async while second tick');
    await tickAgain();
    count = count + 1;
  }
  console.log('async while done');
}

repeat();
