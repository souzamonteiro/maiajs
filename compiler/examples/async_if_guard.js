async function enabledBranch() {
  let enabled = 1;
  if (enabled) {
    await ready();
  } else {
    console.log('enabled else should not run');
  }
  console.log('enabled branch continued');
}

async function disabledBranch() {
  let enabled = 0;
  if (enabled) {
    await shouldNotRun();
  } else {
    console.log('disabled else ran');
  }
  console.log('disabled branch continued');
}

enabledBranch();
disabledBranch();
