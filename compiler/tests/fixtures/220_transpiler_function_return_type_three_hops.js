function source() { return 2.5; }
function middle() { return source(); }
function sink() { return middle(); }
console.log(sink());
