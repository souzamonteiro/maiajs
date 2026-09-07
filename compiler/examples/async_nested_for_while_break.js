async function repeat() {
  for (let outer = 0; outer < 2; outer++) {
    while (1) {
      console.log('async nested break before await');
      await tick();
      console.log('async nested break after await');
      break;
    }
    console.log('async nested break outer tail');
  }
  console.log('async nested break done');
}

repeat();
