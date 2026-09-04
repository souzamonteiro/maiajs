async function printAwaitResult() {
  const marker = await Promise.resolve('async await result retained');
  console.log(marker);
}

printAwaitResult();
