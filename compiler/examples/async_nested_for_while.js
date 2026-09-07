async function repeat() {
  for (let outer = 0; outer < 2; outer++) {
    let inner = 0;
    while (inner < 1) {
      console.log('async nested for while iteration');
      await tick();
      inner++;
      console.log('async nested for while resumed');
    }
    console.log('async nested for while outer tail');
  }
  console.log('async nested for while done');
}

repeat();
