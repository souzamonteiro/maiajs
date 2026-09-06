async function stop() {
  for (let index = 0; index < 3; index++) {
    console.log('async for break before await');
    await tick();
    console.log('async for break after await');
    break;
  }
  console.log('async for break after loop');
}

stop();
