function control(x) {
  if (x) { while (x) { break; } } else { do { x = 0; } while (x); }
  for (var i = 0; i < 3; i++) { console.log(i); }
  switch (x) { case 0: console.log("zero"); break; default: console.log("other"); }
}
