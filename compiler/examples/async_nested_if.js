async function choose() {
  if (true) {
    if (false) {
      console.log('async nested true branch');
      await firstTick();
      console.log('async nested true branch resumed');
    } else {
      console.log('async nested false branch');
      await secondTick();
      console.log('async nested false branch resumed');
    }
  }
  console.log('async nested if done');
}

choose();
