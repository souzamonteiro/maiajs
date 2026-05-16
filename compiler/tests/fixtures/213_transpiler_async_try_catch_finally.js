async function run(value) {
  try {
    await fetch(value);
    return value;
  } catch (err) {
    console.log(err);
  } finally {
    console.log("done");
  }
}
