async function thenBranch() {
  let enabled = 1;
  if (enabled) {
    console.log('async then before');
    await thenTick();
    console.log('async then after');
  } else {
    console.log('async else should not run');
    await elseTick();
    console.log('async else after should not run');
  }
}

async function elseBranch() {
  let enabled = 0;
  if (enabled) {
    await thenTick();
  } else {
    console.log('async else before');
    await elseTick();
    console.log('async else after');
  }
}

thenBranch();
elseBranch();
