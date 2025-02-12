window.addEventListener('fullyLoaded', function () {
  var items = [
    { content: 'my first widget' }, // will default to location (0,0) and 1x1
    { w: 2, content: 'another longer widget!' }, // will be placed next at (1,0) and 2x1
  ];
  var grid = GridStack.init({
    row: 6,
    children: items,
    float: true
  });
})

window.loaded ??= 0; window.loaded++;
if (window.loaded >= 3) { window.dispatchEvent(new Event('fullyLoaded')) }