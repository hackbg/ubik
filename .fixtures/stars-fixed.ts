import * as __foo from "foobar"

import type * as _foo from "foobar"
//@ts-ignore
const foo = __foo['default']

function doSomething (x: _foo.Bar = new foo.Bar()): _foo.Baz {
}

function doSomethingMoreComplex (x: {
  bar: _foo.Bar,
  baz: {
    bar: _foo.Bar,
    baz: _foo.Baz
  }
} = {
  bar: new foo.Bar(),
  baz: {
    bar: new foo.Bar(),
    baz: new foo.Baz()
  },
}): {
  bar: _foo.Bar,
  baz: _foo.Baz
} {
  return {
    bar: null as _foo.Bar,
    baz: {
      bar: null as _foo.Bar,
      baz: null as _foo.Baz,
    }
  };
}
