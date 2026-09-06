async function repeat() {
  for (let index = 0; index < 2; index++) {
    console.log('async for iteration');
    await tick();
    console.log('async for resumed');
  }
  console.log('async for done');
}

repeat();
