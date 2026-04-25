const setLike = [1, 2, 3, 3, 4].filter(function(v, i, arr) {
  return arr.indexOf(v) === i;
});