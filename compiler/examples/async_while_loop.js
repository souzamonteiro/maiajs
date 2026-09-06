async function repeat() {
  let count = 0;
  while (count < 2) {
    if (count === 0) {
      console.log('async while true branch');
      await tick();
      console.log('async while true branch resumed');
    } else {
      console.log('async while false branch');
      await elseTick();
      console.log('async while false branch resumed');
    }
    count = count + 1;
  }
  console.log('async while done');
}

repeat();
