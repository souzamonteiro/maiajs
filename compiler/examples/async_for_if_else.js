async function repeat() {
  for (let index = 0; index < 2; index++) {
    if (index === 0) {
      console.log('async for true branch');
      await firstTick();
      console.log('async for true branch resumed');
    } else {
      console.log('async for false branch');
      await secondTick();
      console.log('async for false branch resumed');
    }
  }
  console.log('async for branches done');
}

repeat();
