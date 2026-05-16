function shadow(x) {
  let y = x;
  {
    let y = 3;
    console.log(y);
  }
  return y;
}
console.log(shadow(1));
