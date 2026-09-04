async function firstFailure() {
  try {
    await failFirst();
  } catch (error) {
    console.log(error);
  }
}

async function secondFailure() {
  try {
    await failSecond();
  } catch (error) {
    console.log(error);
  }
}

firstFailure();
secondFailure();
