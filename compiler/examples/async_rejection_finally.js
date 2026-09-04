async function releaseAfterFailure() {
  try {
    await failLater();
  } finally {
    console.log('async rejection finally');
  }
}

releaseAfterFailure();
