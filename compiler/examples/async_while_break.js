async function stopAfterAwait() {
  while (1) {
    console.log('async break before await');
    await tick();
    console.log('async break after await');
    break;
  }
  console.log('async break after loop');
}

stopAfterAwait();
