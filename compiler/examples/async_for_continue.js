async function repeat() {
  for (let index = 0; index < 2; index++) {
    console.log('async for continue before await');
    await tick();
    console.log('async for continue after await');
    continue;
  }
  console.log('async for continue after loop');
}

repeat();
