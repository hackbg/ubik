import * as foo from "foobar"

function doSomething (x: foo.Bar = new foo.Bar()): foo.Baz {
}

function doSomethingMoreComplex (x: {
  bar: foo.Bar,
  baz: {
    bar: foo.Bar,
    baz: foo.Baz
  }
} = {
  bar: new foo.Bar(),
  baz: {
    bar: new foo.Bar(),
    baz: new foo.Baz()
  },
}): {
  bar: foo.Bar,
  baz: foo.Baz
} {
  return {
    bar: null as foo.Bar,
    baz: {
      bar: null as foo.Bar,
      baz: null as foo.Baz,
    }
  }
}
