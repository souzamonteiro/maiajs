async function handleRejection() {
  try {
    await failLater();
  } catch (error) {
    console.log('async rejection caught');
  }
}

handleRejection();
