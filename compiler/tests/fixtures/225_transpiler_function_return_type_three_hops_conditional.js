function source(flag) { if (flag) { return 2.5; } return 1; }
function middle(flag) { return source(flag); }
function sink(flag) { return middle(flag); }
console.log(sink(1));
