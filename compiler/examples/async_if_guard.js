async function enabledBranch() {
  let enabled = 1;
  if (enabled) {
    console.log('enabled before await');
    await ready();
    console.log('enabled after first await');
    await readySecond();
    console.log('enabled after second await');
  } else {
    console.log('enabled else should not run');
  }
  console.log('enabled branch continued');
}

async function disabledBranch() {
  let enabled = 0;
  if (enabled) {
    console.log('disabled before await should not run');
    await shouldNotRun();
    console.log('disabled after first await should not run');
    await shouldNotRunSecond();
    console.log('disabled after second await should not run');
  } else {
    console.log('disabled else ran');
  }
  console.log('disabled branch continued');
}

enabledBranch();
disabledBranch();
