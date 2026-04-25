try {
  throw 'Simple error';
} catch (e) {
  console.log(e);
}

try {
  const x = 42;
  throw x + 1;
} catch (err) {
  console.log(err);
}
