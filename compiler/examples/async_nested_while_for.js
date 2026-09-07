async function repeat() {
  let outer = 0;
  while (outer < 2) {
    for (let inner = 0; inner < 1; inner++) {
      console.log('async nested while for iteration');
      await tick();
      console.log('async nested while for resumed');
    }
    outer++;
    console.log('async nested while for outer tail');
  }
  console.log('async nested while for done');
}

repeat();
