async function repeat() {
  for (let outer = 0; outer < 2; outer++) {
    let inner = 0;
    while (inner < 1) {
      console.log('async nested continue before await');
      await tick();
      inner++;
      console.log('async nested continue after await');
      continue;
    }
    console.log('async nested continue outer tail');
  }
  console.log('async nested continue done');
}

repeat();
