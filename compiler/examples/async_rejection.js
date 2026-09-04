async function handleRejection() {
  try {
    await failLater();
  } catch (error) {
    console.log(error);
  }
}

handleRejection();
