async function handleAndCleanup() {
  try {
    await failLater();
  } catch (error) {
    console.log(error);
  } finally {
    console.log('finally after catch');
  }
  console.log('continued after catch finally');
}

handleAndCleanup();
