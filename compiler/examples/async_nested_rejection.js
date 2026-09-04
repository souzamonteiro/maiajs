async function handleNestedFailure() {
  try {
    try {
      await failLater();
    } finally {
      console.log('inner finally ran');
    }
  } catch (error) {
    console.log(error);
  }
}

handleNestedFailure();
