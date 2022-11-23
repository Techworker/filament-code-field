(() => {
  // node_modules/@codemirror/state/dist/index.js
  var Text = class {
    constructor() {
    }
    lineAt(pos) {
      if (pos < 0 || pos > this.length)
        throw new RangeError(`Invalid position ${pos} in document of length ${this.length}`);
      return this.lineInner(pos, false, 1, 0);
    }
    line(n) {
      if (n < 1 || n > this.lines)
        throw new RangeError(`Invalid line number ${n} in ${this.lines}-line document`);
      return this.lineInner(n, true, 1, 0);
    }
    replace(from, to, text) {
      let parts = [];
      this.decompose(0, from, parts, 2);
      if (text.length)
        text.decompose(0, text.length, parts, 1 | 2);
      this.decompose(to, this.length, parts, 1);
      return TextNode.from(parts, this.length - (to - from) + text.length);
    }
    append(other) {
      return this.replace(this.length, this.length, other);
    }
    slice(from, to = this.length) {
      let parts = [];
      this.decompose(from, to, parts, 0);
      return TextNode.from(parts, to - from);
    }
    eq(other) {
      if (other == this)
        return true;
      if (other.length != this.length || other.lines != this.lines)
        return false;
      let start = this.scanIdentical(other, 1), end = this.length - this.scanIdentical(other, -1);
      let a = new RawTextCursor(this), b = new RawTextCursor(other);
      for (let skip = start, pos = start; ; ) {
        a.next(skip);
        b.next(skip);
        skip = 0;
        if (a.lineBreak != b.lineBreak || a.done != b.done || a.value != b.value)
          return false;
        pos += a.value.length;
        if (a.done || pos >= end)
          return true;
      }
    }
    iter(dir = 1) {
      return new RawTextCursor(this, dir);
    }
    iterRange(from, to = this.length) {
      return new PartialTextCursor(this, from, to);
    }
    iterLines(from, to) {
      let inner;
      if (from == null) {
        inner = this.iter();
      } else {
        if (to == null)
          to = this.lines + 1;
        let start = this.line(from).from;
        inner = this.iterRange(start, Math.max(start, to == this.lines + 1 ? this.length : to <= 1 ? 0 : this.line(to - 1).to));
      }
      return new LineCursor(inner);
    }
    toString() {
      return this.sliceString(0);
    }
    toJSON() {
      let lines = [];
      this.flatten(lines);
      return lines;
    }
    static of(text) {
      if (text.length == 0)
        throw new RangeError("A document must have at least one line");
      if (text.length == 1 && !text[0])
        return Text.empty;
      return text.length <= 32 ? new TextLeaf(text) : TextNode.from(TextLeaf.split(text, []));
    }
  };
  var TextLeaf = class extends Text {
    constructor(text, length = textLength(text)) {
      super();
      this.text = text;
      this.length = length;
    }
    get lines() {
      return this.text.length;
    }
    get children() {
      return null;
    }
    lineInner(target, isLine, line, offset) {
      for (let i = 0; ; i++) {
        let string2 = this.text[i], end = offset + string2.length;
        if ((isLine ? line : end) >= target)
          return new Line(offset, end, line, string2);
        offset = end + 1;
        line++;
      }
    }
    decompose(from, to, target, open) {
      let text = from <= 0 && to >= this.length ? this : new TextLeaf(sliceText(this.text, from, to), Math.min(to, this.length) - Math.max(0, from));
      if (open & 1) {
        let prev = target.pop();
        let joined = appendText(text.text, prev.text.slice(), 0, text.length);
        if (joined.length <= 32) {
          target.push(new TextLeaf(joined, prev.length + text.length));
        } else {
          let mid = joined.length >> 1;
          target.push(new TextLeaf(joined.slice(0, mid)), new TextLeaf(joined.slice(mid)));
        }
      } else {
        target.push(text);
      }
    }
    replace(from, to, text) {
      if (!(text instanceof TextLeaf))
        return super.replace(from, to, text);
      let lines = appendText(this.text, appendText(text.text, sliceText(this.text, 0, from)), to);
      let newLen = this.length + text.length - (to - from);
      if (lines.length <= 32)
        return new TextLeaf(lines, newLen);
      return TextNode.from(TextLeaf.split(lines, []), newLen);
    }
    sliceString(from, to = this.length, lineSep = "\n") {
      let result = "";
      for (let pos = 0, i = 0; pos <= to && i < this.text.length; i++) {
        let line = this.text[i], end = pos + line.length;
        if (pos > from && i)
          result += lineSep;
        if (from < end && to > pos)
          result += line.slice(Math.max(0, from - pos), to - pos);
        pos = end + 1;
      }
      return result;
    }
    flatten(target) {
      for (let line of this.text)
        target.push(line);
    }
    scanIdentical() {
      return 0;
    }
    static split(text, target) {
      let part = [], len = -1;
      for (let line of text) {
        part.push(line);
        len += line.length + 1;
        if (part.length == 32) {
          target.push(new TextLeaf(part, len));
          part = [];
          len = -1;
        }
      }
      if (len > -1)
        target.push(new TextLeaf(part, len));
      return target;
    }
  };
  var TextNode = class extends Text {
    constructor(children, length) {
      super();
      this.children = children;
      this.length = length;
      this.lines = 0;
      for (let child of children)
        this.lines += child.lines;
    }
    lineInner(target, isLine, line, offset) {
      for (let i = 0; ; i++) {
        let child = this.children[i], end = offset + child.length, endLine = line + child.lines - 1;
        if ((isLine ? endLine : end) >= target)
          return child.lineInner(target, isLine, line, offset);
        offset = end + 1;
        line = endLine + 1;
      }
    }
    decompose(from, to, target, open) {
      for (let i = 0, pos = 0; pos <= to && i < this.children.length; i++) {
        let child = this.children[i], end = pos + child.length;
        if (from <= end && to >= pos) {
          let childOpen = open & ((pos <= from ? 1 : 0) | (end >= to ? 2 : 0));
          if (pos >= from && end <= to && !childOpen)
            target.push(child);
          else
            child.decompose(from - pos, to - pos, target, childOpen);
        }
        pos = end + 1;
      }
    }
    replace(from, to, text) {
      if (text.lines < this.lines)
        for (let i = 0, pos = 0; i < this.children.length; i++) {
          let child = this.children[i], end = pos + child.length;
          if (from >= pos && to <= end) {
            let updated = child.replace(from - pos, to - pos, text);
            let totalLines = this.lines - child.lines + updated.lines;
            if (updated.lines < totalLines >> 5 - 1 && updated.lines > totalLines >> 5 + 1) {
              let copy = this.children.slice();
              copy[i] = updated;
              return new TextNode(copy, this.length - (to - from) + text.length);
            }
            return super.replace(pos, end, updated);
          }
          pos = end + 1;
        }
      return super.replace(from, to, text);
    }
    sliceString(from, to = this.length, lineSep = "\n") {
      let result = "";
      for (let i = 0, pos = 0; i < this.children.length && pos <= to; i++) {
        let child = this.children[i], end = pos + child.length;
        if (pos > from && i)
          result += lineSep;
        if (from < end && to > pos)
          result += child.sliceString(from - pos, to - pos, lineSep);
        pos = end + 1;
      }
      return result;
    }
    flatten(target) {
      for (let child of this.children)
        child.flatten(target);
    }
    scanIdentical(other, dir) {
      if (!(other instanceof TextNode))
        return 0;
      let length = 0;
      let [iA, iB, eA, eB] = dir > 0 ? [0, 0, this.children.length, other.children.length] : [this.children.length - 1, other.children.length - 1, -1, -1];
      for (; ; iA += dir, iB += dir) {
        if (iA == eA || iB == eB)
          return length;
        let chA = this.children[iA], chB = other.children[iB];
        if (chA != chB)
          return length + chA.scanIdentical(chB, dir);
        length += chA.length + 1;
      }
    }
    static from(children, length = children.reduce((l, ch) => l + ch.length + 1, -1)) {
      let lines = 0;
      for (let ch of children)
        lines += ch.lines;
      if (lines < 32) {
        let flat = [];
        for (let ch of children)
          ch.flatten(flat);
        return new TextLeaf(flat, length);
      }
      let chunk = Math.max(32, lines >> 5), maxChunk = chunk << 1, minChunk = chunk >> 1;
      let chunked = [], currentLines = 0, currentLen = -1, currentChunk = [];
      function add(child) {
        let last;
        if (child.lines > maxChunk && child instanceof TextNode) {
          for (let node of child.children)
            add(node);
        } else if (child.lines > minChunk && (currentLines > minChunk || !currentLines)) {
          flush();
          chunked.push(child);
        } else if (child instanceof TextLeaf && currentLines && (last = currentChunk[currentChunk.length - 1]) instanceof TextLeaf && child.lines + last.lines <= 32) {
          currentLines += child.lines;
          currentLen += child.length + 1;
          currentChunk[currentChunk.length - 1] = new TextLeaf(last.text.concat(child.text), last.length + 1 + child.length);
        } else {
          if (currentLines + child.lines > chunk)
            flush();
          currentLines += child.lines;
          currentLen += child.length + 1;
          currentChunk.push(child);
        }
      }
      function flush() {
        if (currentLines == 0)
          return;
        chunked.push(currentChunk.length == 1 ? currentChunk[0] : TextNode.from(currentChunk, currentLen));
        currentLen = -1;
        currentLines = currentChunk.length = 0;
      }
      for (let child of children)
        add(child);
      flush();
      return chunked.length == 1 ? chunked[0] : new TextNode(chunked, length);
    }
  };
  Text.empty = /* @__PURE__ */ new TextLeaf([""], 0);
  function textLength(text) {
    let length = -1;
    for (let line of text)
      length += line.length + 1;
    return length;
  }
  function appendText(text, target, from = 0, to = 1e9) {
    for (let pos = 0, i = 0, first = true; i < text.length && pos <= to; i++) {
      let line = text[i], end = pos + line.length;
      if (end >= from) {
        if (end > to)
          line = line.slice(0, to - pos);
        if (pos < from)
          line = line.slice(from - pos);
        if (first) {
          target[target.length - 1] += line;
          first = false;
        } else
          target.push(line);
      }
      pos = end + 1;
    }
    return target;
  }
  function sliceText(text, from, to) {
    return appendText(text, [""], from, to);
  }
  var RawTextCursor = class {
    constructor(text, dir = 1) {
      this.dir = dir;
      this.done = false;
      this.lineBreak = false;
      this.value = "";
      this.nodes = [text];
      this.offsets = [dir > 0 ? 1 : (text instanceof TextLeaf ? text.text.length : text.children.length) << 1];
    }
    nextInner(skip, dir) {
      this.done = this.lineBreak = false;
      for (; ; ) {
        let last = this.nodes.length - 1;
        let top2 = this.nodes[last], offsetValue = this.offsets[last], offset = offsetValue >> 1;
        let size = top2 instanceof TextLeaf ? top2.text.length : top2.children.length;
        if (offset == (dir > 0 ? size : 0)) {
          if (last == 0) {
            this.done = true;
            this.value = "";
            return this;
          }
          if (dir > 0)
            this.offsets[last - 1]++;
          this.nodes.pop();
          this.offsets.pop();
        } else if ((offsetValue & 1) == (dir > 0 ? 0 : 1)) {
          this.offsets[last] += dir;
          if (skip == 0) {
            this.lineBreak = true;
            this.value = "\n";
            return this;
          }
          skip--;
        } else if (top2 instanceof TextLeaf) {
          let next = top2.text[offset + (dir < 0 ? -1 : 0)];
          this.offsets[last] += dir;
          if (next.length > Math.max(0, skip)) {
            this.value = skip == 0 ? next : dir > 0 ? next.slice(skip) : next.slice(0, next.length - skip);
            return this;
          }
          skip -= next.length;
        } else {
          let next = top2.children[offset + (dir < 0 ? -1 : 0)];
          if (skip > next.length) {
            skip -= next.length;
            this.offsets[last] += dir;
          } else {
            if (dir < 0)
              this.offsets[last]--;
            this.nodes.push(next);
            this.offsets.push(dir > 0 ? 1 : (next instanceof TextLeaf ? next.text.length : next.children.length) << 1);
          }
        }
      }
    }
    next(skip = 0) {
      if (skip < 0) {
        this.nextInner(-skip, -this.dir);
        skip = this.value.length;
      }
      return this.nextInner(skip, this.dir);
    }
  };
  var PartialTextCursor = class {
    constructor(text, start, end) {
      this.value = "";
      this.done = false;
      this.cursor = new RawTextCursor(text, start > end ? -1 : 1);
      this.pos = start > end ? text.length : 0;
      this.from = Math.min(start, end);
      this.to = Math.max(start, end);
    }
    nextInner(skip, dir) {
      if (dir < 0 ? this.pos <= this.from : this.pos >= this.to) {
        this.value = "";
        this.done = true;
        return this;
      }
      skip += Math.max(0, dir < 0 ? this.pos - this.to : this.from - this.pos);
      let limit = dir < 0 ? this.pos - this.from : this.to - this.pos;
      if (skip > limit)
        skip = limit;
      limit -= skip;
      let {value} = this.cursor.next(skip);
      this.pos += (value.length + skip) * dir;
      this.value = value.length <= limit ? value : dir < 0 ? value.slice(value.length - limit) : value.slice(0, limit);
      this.done = !this.value;
      return this;
    }
    next(skip = 0) {
      if (skip < 0)
        skip = Math.max(skip, this.from - this.pos);
      else if (skip > 0)
        skip = Math.min(skip, this.to - this.pos);
      return this.nextInner(skip, this.cursor.dir);
    }
    get lineBreak() {
      return this.cursor.lineBreak && this.value != "";
    }
  };
  var LineCursor = class {
    constructor(inner) {
      this.inner = inner;
      this.afterBreak = true;
      this.value = "";
      this.done = false;
    }
    next(skip = 0) {
      let {done, lineBreak, value} = this.inner.next(skip);
      if (done) {
        this.done = true;
        this.value = "";
      } else if (lineBreak) {
        if (this.afterBreak) {
          this.value = "";
        } else {
          this.afterBreak = true;
          this.next();
        }
      } else {
        this.value = value;
        this.afterBreak = false;
      }
      return this;
    }
    get lineBreak() {
      return false;
    }
  };
  if (typeof Symbol != "undefined") {
    Text.prototype[Symbol.iterator] = function() {
      return this.iter();
    };
    RawTextCursor.prototype[Symbol.iterator] = PartialTextCursor.prototype[Symbol.iterator] = LineCursor.prototype[Symbol.iterator] = function() {
      return this;
    };
  }
  var Line = class {
    constructor(from, to, number2, text) {
      this.from = from;
      this.to = to;
      this.number = number2;
      this.text = text;
    }
    get length() {
      return this.to - this.from;
    }
  };
  var extend = /* @__PURE__ */ "lc,34,7n,7,7b,19,,,,2,,2,,,20,b,1c,l,g,,2t,7,2,6,2,2,,4,z,,u,r,2j,b,1m,9,9,,o,4,,9,,3,,5,17,3,3b,f,,w,1j,,,,4,8,4,,3,7,a,2,t,,1m,,,,2,4,8,,9,,a,2,q,,2,2,1l,,4,2,4,2,2,3,3,,u,2,3,,b,2,1l,,4,5,,2,4,,k,2,m,6,,,1m,,,2,,4,8,,7,3,a,2,u,,1n,,,,c,,9,,14,,3,,1l,3,5,3,,4,7,2,b,2,t,,1m,,2,,2,,3,,5,2,7,2,b,2,s,2,1l,2,,,2,4,8,,9,,a,2,t,,20,,4,,2,3,,,8,,29,,2,7,c,8,2q,,2,9,b,6,22,2,r,,,,,,1j,e,,5,,2,5,b,,10,9,,2u,4,,6,,2,2,2,p,2,4,3,g,4,d,,2,2,6,,f,,jj,3,qa,3,t,3,t,2,u,2,1s,2,,7,8,,2,b,9,,19,3,3b,2,y,,3a,3,4,2,9,,6,3,63,2,2,,1m,,,7,,,,,2,8,6,a,2,,1c,h,1r,4,1c,7,,,5,,14,9,c,2,w,4,2,2,,3,1k,,,2,3,,,3,1m,8,2,2,48,3,,d,,7,4,,6,,3,2,5i,1m,,5,ek,,5f,x,2da,3,3x,,2o,w,fe,6,2x,2,n9w,4,,a,w,2,28,2,7k,,3,,4,,p,2,5,,47,2,q,i,d,,12,8,p,b,1a,3,1c,,2,4,2,2,13,,1v,6,2,2,2,2,c,,8,,1b,,1f,,,3,2,2,5,2,,,16,2,8,,6m,,2,,4,,fn4,,kh,g,g,g,a6,2,gt,,6a,,45,5,1ae,3,,2,5,4,14,3,4,,4l,2,fx,4,ar,2,49,b,4w,,1i,f,1k,3,1d,4,2,2,1x,3,10,5,,8,1q,,c,2,1g,9,a,4,2,,2n,3,2,,,2,6,,4g,,3,8,l,2,1l,2,,,,,m,,e,7,3,5,5f,8,2,3,,,n,,29,,2,6,,,2,,,2,,2,6j,,2,4,6,2,,2,r,2,2d,8,2,,,2,2y,,,,2,6,,,2t,3,2,4,,5,77,9,,2,6t,,a,2,,,4,,40,4,2,2,4,,w,a,14,6,2,4,8,,9,6,2,3,1a,d,,2,ba,7,,6,,,2a,m,2,7,,2,,2,3e,6,3,,,2,,7,,,20,2,3,,,,9n,2,f0b,5,1n,7,t4,,1r,4,29,,f5k,2,43q,,,3,4,5,8,8,2,7,u,4,44,3,1iz,1j,4,1e,8,,e,,m,5,,f,11s,7,,h,2,7,,2,,5,79,7,c5,4,15s,7,31,7,240,5,gx7k,2o,3k,6o".split(",").map((s) => s ? parseInt(s, 36) : 1);
  for (let i = 1; i < extend.length; i++)
    extend[i] += extend[i - 1];
  function isExtendingChar(code) {
    for (let i = 1; i < extend.length; i += 2)
      if (extend[i] > code)
        return extend[i - 1] <= code;
    return false;
  }
  function isRegionalIndicator(code) {
    return code >= 127462 && code <= 127487;
  }
  var ZWJ = 8205;
  function findClusterBreak(str, pos, forward = true, includeExtending = true) {
    return (forward ? nextClusterBreak : prevClusterBreak)(str, pos, includeExtending);
  }
  function nextClusterBreak(str, pos, includeExtending) {
    if (pos == str.length)
      return pos;
    if (pos && surrogateLow(str.charCodeAt(pos)) && surrogateHigh(str.charCodeAt(pos - 1)))
      pos--;
    let prev = codePointAt(str, pos);
    pos += codePointSize(prev);
    while (pos < str.length) {
      let next = codePointAt(str, pos);
      if (prev == ZWJ || next == ZWJ || includeExtending && isExtendingChar(next)) {
        pos += codePointSize(next);
        prev = next;
      } else if (isRegionalIndicator(next)) {
        let countBefore = 0, i = pos - 2;
        while (i >= 0 && isRegionalIndicator(codePointAt(str, i))) {
          countBefore++;
          i -= 2;
        }
        if (countBefore % 2 == 0)
          break;
        else
          pos += 2;
      } else {
        break;
      }
    }
    return pos;
  }
  function prevClusterBreak(str, pos, includeExtending) {
    while (pos > 0) {
      let found = nextClusterBreak(str, pos - 2, includeExtending);
      if (found < pos)
        return found;
      pos--;
    }
    return 0;
  }
  function surrogateLow(ch) {
    return ch >= 56320 && ch < 57344;
  }
  function surrogateHigh(ch) {
    return ch >= 55296 && ch < 56320;
  }
  function codePointAt(str, pos) {
    let code0 = str.charCodeAt(pos);
    if (!surrogateHigh(code0) || pos + 1 == str.length)
      return code0;
    let code1 = str.charCodeAt(pos + 1);
    if (!surrogateLow(code1))
      return code0;
    return (code0 - 55296 << 10) + (code1 - 56320) + 65536;
  }
  function fromCodePoint(code) {
    if (code <= 65535)
      return String.fromCharCode(code);
    code -= 65536;
    return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
  }
  function codePointSize(code) {
    return code < 65536 ? 1 : 2;
  }
  var DefaultSplit = /\r\n?|\n/;
  var MapMode = /* @__PURE__ */ function(MapMode2) {
    MapMode2[MapMode2["Simple"] = 0] = "Simple";
    MapMode2[MapMode2["TrackDel"] = 1] = "TrackDel";
    MapMode2[MapMode2["TrackBefore"] = 2] = "TrackBefore";
    MapMode2[MapMode2["TrackAfter"] = 3] = "TrackAfter";
    return MapMode2;
  }(MapMode || (MapMode = {}));
  var ChangeDesc = class {
    constructor(sections) {
      this.sections = sections;
    }
    get length() {
      let result = 0;
      for (let i = 0; i < this.sections.length; i += 2)
        result += this.sections[i];
      return result;
    }
    get newLength() {
      let result = 0;
      for (let i = 0; i < this.sections.length; i += 2) {
        let ins = this.sections[i + 1];
        result += ins < 0 ? this.sections[i] : ins;
      }
      return result;
    }
    get empty() {
      return this.sections.length == 0 || this.sections.length == 2 && this.sections[1] < 0;
    }
    iterGaps(f) {
      for (let i = 0, posA = 0, posB = 0; i < this.sections.length; ) {
        let len = this.sections[i++], ins = this.sections[i++];
        if (ins < 0) {
          f(posA, posB, len);
          posB += len;
        } else {
          posB += ins;
        }
        posA += len;
      }
    }
    iterChangedRanges(f, individual = false) {
      iterChanges(this, f, individual);
    }
    get invertedDesc() {
      let sections = [];
      for (let i = 0; i < this.sections.length; ) {
        let len = this.sections[i++], ins = this.sections[i++];
        if (ins < 0)
          sections.push(len, ins);
        else
          sections.push(ins, len);
      }
      return new ChangeDesc(sections);
    }
    composeDesc(other) {
      return this.empty ? other : other.empty ? this : composeSets(this, other);
    }
    mapDesc(other, before = false) {
      return other.empty ? this : mapSet(this, other, before);
    }
    mapPos(pos, assoc = -1, mode = MapMode.Simple) {
      let posA = 0, posB = 0;
      for (let i = 0; i < this.sections.length; ) {
        let len = this.sections[i++], ins = this.sections[i++], endA = posA + len;
        if (ins < 0) {
          if (endA > pos)
            return posB + (pos - posA);
          posB += len;
        } else {
          if (mode != MapMode.Simple && endA >= pos && (mode == MapMode.TrackDel && posA < pos && endA > pos || mode == MapMode.TrackBefore && posA < pos || mode == MapMode.TrackAfter && endA > pos))
            return null;
          if (endA > pos || endA == pos && assoc < 0 && !len)
            return pos == posA || assoc < 0 ? posB : posB + ins;
          posB += ins;
        }
        posA = endA;
      }
      if (pos > posA)
        throw new RangeError(`Position ${pos} is out of range for changeset of length ${posA}`);
      return posB;
    }
    touchesRange(from, to = from) {
      for (let i = 0, pos = 0; i < this.sections.length && pos <= to; ) {
        let len = this.sections[i++], ins = this.sections[i++], end = pos + len;
        if (ins >= 0 && pos <= to && end >= from)
          return pos < from && end > to ? "cover" : true;
        pos = end;
      }
      return false;
    }
    toString() {
      let result = "";
      for (let i = 0; i < this.sections.length; ) {
        let len = this.sections[i++], ins = this.sections[i++];
        result += (result ? " " : "") + len + (ins >= 0 ? ":" + ins : "");
      }
      return result;
    }
    toJSON() {
      return this.sections;
    }
    static fromJSON(json2) {
      if (!Array.isArray(json2) || json2.length % 2 || json2.some((a) => typeof a != "number"))
        throw new RangeError("Invalid JSON representation of ChangeDesc");
      return new ChangeDesc(json2);
    }
    static create(sections) {
      return new ChangeDesc(sections);
    }
  };
  var ChangeSet = class extends ChangeDesc {
    constructor(sections, inserted) {
      super(sections);
      this.inserted = inserted;
    }
    apply(doc2) {
      if (this.length != doc2.length)
        throw new RangeError("Applying change set to a document with the wrong length");
      iterChanges(this, (fromA, toA, fromB, _toB, text) => doc2 = doc2.replace(fromB, fromB + (toA - fromA), text), false);
      return doc2;
    }
    mapDesc(other, before = false) {
      return mapSet(this, other, before, true);
    }
    invert(doc2) {
      let sections = this.sections.slice(), inserted = [];
      for (let i = 0, pos = 0; i < sections.length; i += 2) {
        let len = sections[i], ins = sections[i + 1];
        if (ins >= 0) {
          sections[i] = ins;
          sections[i + 1] = len;
          let index = i >> 1;
          while (inserted.length < index)
            inserted.push(Text.empty);
          inserted.push(len ? doc2.slice(pos, pos + len) : Text.empty);
        }
        pos += len;
      }
      return new ChangeSet(sections, inserted);
    }
    compose(other) {
      return this.empty ? other : other.empty ? this : composeSets(this, other, true);
    }
    map(other, before = false) {
      return other.empty ? this : mapSet(this, other, before, true);
    }
    iterChanges(f, individual = false) {
      iterChanges(this, f, individual);
    }
    get desc() {
      return ChangeDesc.create(this.sections);
    }
    filter(ranges) {
      let resultSections = [], resultInserted = [], filteredSections = [];
      let iter = new SectionIter(this);
      done:
        for (let i = 0, pos = 0; ; ) {
          let next = i == ranges.length ? 1e9 : ranges[i++];
          while (pos < next || pos == next && iter.len == 0) {
            if (iter.done)
              break done;
            let len = Math.min(iter.len, next - pos);
            addSection(filteredSections, len, -1);
            let ins = iter.ins == -1 ? -1 : iter.off == 0 ? iter.ins : 0;
            addSection(resultSections, len, ins);
            if (ins > 0)
              addInsert(resultInserted, resultSections, iter.text);
            iter.forward(len);
            pos += len;
          }
          let end = ranges[i++];
          while (pos < end) {
            if (iter.done)
              break done;
            let len = Math.min(iter.len, end - pos);
            addSection(resultSections, len, -1);
            addSection(filteredSections, len, iter.ins == -1 ? -1 : iter.off == 0 ? iter.ins : 0);
            iter.forward(len);
            pos += len;
          }
        }
      return {
        changes: new ChangeSet(resultSections, resultInserted),
        filtered: ChangeDesc.create(filteredSections)
      };
    }
    toJSON() {
      let parts = [];
      for (let i = 0; i < this.sections.length; i += 2) {
        let len = this.sections[i], ins = this.sections[i + 1];
        if (ins < 0)
          parts.push(len);
        else if (ins == 0)
          parts.push([len]);
        else
          parts.push([len].concat(this.inserted[i >> 1].toJSON()));
      }
      return parts;
    }
    static of(changes, length, lineSep) {
      let sections = [], inserted = [], pos = 0;
      let total = null;
      function flush(force = false) {
        if (!force && !sections.length)
          return;
        if (pos < length)
          addSection(sections, length - pos, -1);
        let set = new ChangeSet(sections, inserted);
        total = total ? total.compose(set.map(total)) : set;
        sections = [];
        inserted = [];
        pos = 0;
      }
      function process2(spec) {
        if (Array.isArray(spec)) {
          for (let sub of spec)
            process2(sub);
        } else if (spec instanceof ChangeSet) {
          if (spec.length != length)
            throw new RangeError(`Mismatched change set length (got ${spec.length}, expected ${length})`);
          flush();
          total = total ? total.compose(spec.map(total)) : spec;
        } else {
          let {from, to = from, insert: insert2} = spec;
          if (from > to || from < 0 || to > length)
            throw new RangeError(`Invalid change range ${from} to ${to} (in doc of length ${length})`);
          let insText = !insert2 ? Text.empty : typeof insert2 == "string" ? Text.of(insert2.split(lineSep || DefaultSplit)) : insert2;
          let insLen = insText.length;
          if (from == to && insLen == 0)
            return;
          if (from < pos)
            flush();
          if (from > pos)
            addSection(sections, from - pos, -1);
          addSection(sections, to - from, insLen);
          addInsert(inserted, sections, insText);
          pos = to;
        }
      }
      process2(changes);
      flush(!total);
      return total;
    }
    static empty(length) {
      return new ChangeSet(length ? [length, -1] : [], []);
    }
    static fromJSON(json2) {
      if (!Array.isArray(json2))
        throw new RangeError("Invalid JSON representation of ChangeSet");
      let sections = [], inserted = [];
      for (let i = 0; i < json2.length; i++) {
        let part = json2[i];
        if (typeof part == "number") {
          sections.push(part, -1);
        } else if (!Array.isArray(part) || typeof part[0] != "number" || part.some((e, i2) => i2 && typeof e != "string")) {
          throw new RangeError("Invalid JSON representation of ChangeSet");
        } else if (part.length == 1) {
          sections.push(part[0], 0);
        } else {
          while (inserted.length < i)
            inserted.push(Text.empty);
          inserted[i] = Text.of(part.slice(1));
          sections.push(part[0], inserted[i].length);
        }
      }
      return new ChangeSet(sections, inserted);
    }
    static createSet(sections, inserted) {
      return new ChangeSet(sections, inserted);
    }
  };
  function addSection(sections, len, ins, forceJoin = false) {
    if (len == 0 && ins <= 0)
      return;
    let last = sections.length - 2;
    if (last >= 0 && ins <= 0 && ins == sections[last + 1])
      sections[last] += len;
    else if (len == 0 && sections[last] == 0)
      sections[last + 1] += ins;
    else if (forceJoin) {
      sections[last] += len;
      sections[last + 1] += ins;
    } else
      sections.push(len, ins);
  }
  function addInsert(values2, sections, value) {
    if (value.length == 0)
      return;
    let index = sections.length - 2 >> 1;
    if (index < values2.length) {
      values2[values2.length - 1] = values2[values2.length - 1].append(value);
    } else {
      while (values2.length < index)
        values2.push(Text.empty);
      values2.push(value);
    }
  }
  function iterChanges(desc, f, individual) {
    let inserted = desc.inserted;
    for (let posA = 0, posB = 0, i = 0; i < desc.sections.length; ) {
      let len = desc.sections[i++], ins = desc.sections[i++];
      if (ins < 0) {
        posA += len;
        posB += len;
      } else {
        let endA = posA, endB = posB, text = Text.empty;
        for (; ; ) {
          endA += len;
          endB += ins;
          if (ins && inserted)
            text = text.append(inserted[i - 2 >> 1]);
          if (individual || i == desc.sections.length || desc.sections[i + 1] < 0)
            break;
          len = desc.sections[i++];
          ins = desc.sections[i++];
        }
        f(posA, endA, posB, endB, text);
        posA = endA;
        posB = endB;
      }
    }
  }
  function mapSet(setA, setB, before, mkSet = false) {
    let sections = [], insert2 = mkSet ? [] : null;
    let a = new SectionIter(setA), b = new SectionIter(setB);
    for (let inserted = -1; ; ) {
      if (a.ins == -1 && b.ins == -1) {
        let len = Math.min(a.len, b.len);
        addSection(sections, len, -1);
        a.forward(len);
        b.forward(len);
      } else if (b.ins >= 0 && (a.ins < 0 || inserted == a.i || a.off == 0 && (b.len < a.len || b.len == a.len && !before))) {
        let len = b.len;
        addSection(sections, b.ins, -1);
        while (len) {
          let piece = Math.min(a.len, len);
          if (a.ins >= 0 && inserted < a.i && a.len <= piece) {
            addSection(sections, 0, a.ins);
            if (insert2)
              addInsert(insert2, sections, a.text);
            inserted = a.i;
          }
          a.forward(piece);
          len -= piece;
        }
        b.next();
      } else if (a.ins >= 0) {
        let len = 0, left = a.len;
        while (left) {
          if (b.ins == -1) {
            let piece = Math.min(left, b.len);
            len += piece;
            left -= piece;
            b.forward(piece);
          } else if (b.ins == 0 && b.len < left) {
            left -= b.len;
            b.next();
          } else {
            break;
          }
        }
        addSection(sections, len, inserted < a.i ? a.ins : 0);
        if (insert2 && inserted < a.i)
          addInsert(insert2, sections, a.text);
        inserted = a.i;
        a.forward(a.len - left);
      } else if (a.done && b.done) {
        return insert2 ? ChangeSet.createSet(sections, insert2) : ChangeDesc.create(sections);
      } else {
        throw new Error("Mismatched change set lengths");
      }
    }
  }
  function composeSets(setA, setB, mkSet = false) {
    let sections = [];
    let insert2 = mkSet ? [] : null;
    let a = new SectionIter(setA), b = new SectionIter(setB);
    for (let open = false; ; ) {
      if (a.done && b.done) {
        return insert2 ? ChangeSet.createSet(sections, insert2) : ChangeDesc.create(sections);
      } else if (a.ins == 0) {
        addSection(sections, a.len, 0, open);
        a.next();
      } else if (b.len == 0 && !b.done) {
        addSection(sections, 0, b.ins, open);
        if (insert2)
          addInsert(insert2, sections, b.text);
        b.next();
      } else if (a.done || b.done) {
        throw new Error("Mismatched change set lengths");
      } else {
        let len = Math.min(a.len2, b.len), sectionLen = sections.length;
        if (a.ins == -1) {
          let insB = b.ins == -1 ? -1 : b.off ? 0 : b.ins;
          addSection(sections, len, insB, open);
          if (insert2 && insB)
            addInsert(insert2, sections, b.text);
        } else if (b.ins == -1) {
          addSection(sections, a.off ? 0 : a.len, len, open);
          if (insert2)
            addInsert(insert2, sections, a.textBit(len));
        } else {
          addSection(sections, a.off ? 0 : a.len, b.off ? 0 : b.ins, open);
          if (insert2 && !b.off)
            addInsert(insert2, sections, b.text);
        }
        open = (a.ins > len || b.ins >= 0 && b.len > len) && (open || sections.length > sectionLen);
        a.forward2(len);
        b.forward(len);
      }
    }
  }
  var SectionIter = class {
    constructor(set) {
      this.set = set;
      this.i = 0;
      this.next();
    }
    next() {
      let {sections} = this.set;
      if (this.i < sections.length) {
        this.len = sections[this.i++];
        this.ins = sections[this.i++];
      } else {
        this.len = 0;
        this.ins = -2;
      }
      this.off = 0;
    }
    get done() {
      return this.ins == -2;
    }
    get len2() {
      return this.ins < 0 ? this.len : this.ins;
    }
    get text() {
      let {inserted} = this.set, index = this.i - 2 >> 1;
      return index >= inserted.length ? Text.empty : inserted[index];
    }
    textBit(len) {
      let {inserted} = this.set, index = this.i - 2 >> 1;
      return index >= inserted.length && !len ? Text.empty : inserted[index].slice(this.off, len == null ? void 0 : this.off + len);
    }
    forward(len) {
      if (len == this.len)
        this.next();
      else {
        this.len -= len;
        this.off += len;
      }
    }
    forward2(len) {
      if (this.ins == -1)
        this.forward(len);
      else if (len == this.ins)
        this.next();
      else {
        this.ins -= len;
        this.off += len;
      }
    }
  };
  var SelectionRange = class {
    constructor(from, to, flags) {
      this.from = from;
      this.to = to;
      this.flags = flags;
    }
    get anchor() {
      return this.flags & 16 ? this.to : this.from;
    }
    get head() {
      return this.flags & 16 ? this.from : this.to;
    }
    get empty() {
      return this.from == this.to;
    }
    get assoc() {
      return this.flags & 4 ? -1 : this.flags & 8 ? 1 : 0;
    }
    get bidiLevel() {
      let level = this.flags & 3;
      return level == 3 ? null : level;
    }
    get goalColumn() {
      let value = this.flags >> 5;
      return value == 33554431 ? void 0 : value;
    }
    map(change, assoc = -1) {
      let from, to;
      if (this.empty) {
        from = to = change.mapPos(this.from, assoc);
      } else {
        from = change.mapPos(this.from, 1);
        to = change.mapPos(this.to, -1);
      }
      return from == this.from && to == this.to ? this : new SelectionRange(from, to, this.flags);
    }
    extend(from, to = from) {
      if (from <= this.anchor && to >= this.anchor)
        return EditorSelection.range(from, to);
      let head = Math.abs(from - this.anchor) > Math.abs(to - this.anchor) ? from : to;
      return EditorSelection.range(this.anchor, head);
    }
    eq(other) {
      return this.anchor == other.anchor && this.head == other.head;
    }
    toJSON() {
      return {anchor: this.anchor, head: this.head};
    }
    static fromJSON(json2) {
      if (!json2 || typeof json2.anchor != "number" || typeof json2.head != "number")
        throw new RangeError("Invalid JSON representation for SelectionRange");
      return EditorSelection.range(json2.anchor, json2.head);
    }
    static create(from, to, flags) {
      return new SelectionRange(from, to, flags);
    }
  };
  var EditorSelection = class {
    constructor(ranges, mainIndex) {
      this.ranges = ranges;
      this.mainIndex = mainIndex;
    }
    map(change, assoc = -1) {
      if (change.empty)
        return this;
      return EditorSelection.create(this.ranges.map((r) => r.map(change, assoc)), this.mainIndex);
    }
    eq(other) {
      if (this.ranges.length != other.ranges.length || this.mainIndex != other.mainIndex)
        return false;
      for (let i = 0; i < this.ranges.length; i++)
        if (!this.ranges[i].eq(other.ranges[i]))
          return false;
      return true;
    }
    get main() {
      return this.ranges[this.mainIndex];
    }
    asSingle() {
      return this.ranges.length == 1 ? this : new EditorSelection([this.main], 0);
    }
    addRange(range, main = true) {
      return EditorSelection.create([range].concat(this.ranges), main ? 0 : this.mainIndex + 1);
    }
    replaceRange(range, which = this.mainIndex) {
      let ranges = this.ranges.slice();
      ranges[which] = range;
      return EditorSelection.create(ranges, this.mainIndex);
    }
    toJSON() {
      return {ranges: this.ranges.map((r) => r.toJSON()), main: this.mainIndex};
    }
    static fromJSON(json2) {
      if (!json2 || !Array.isArray(json2.ranges) || typeof json2.main != "number" || json2.main >= json2.ranges.length)
        throw new RangeError("Invalid JSON representation for EditorSelection");
      return new EditorSelection(json2.ranges.map((r) => SelectionRange.fromJSON(r)), json2.main);
    }
    static single(anchor, head = anchor) {
      return new EditorSelection([EditorSelection.range(anchor, head)], 0);
    }
    static create(ranges, mainIndex = 0) {
      if (ranges.length == 0)
        throw new RangeError("A selection needs at least one range");
      for (let pos = 0, i = 0; i < ranges.length; i++) {
        let range = ranges[i];
        if (range.empty ? range.from <= pos : range.from < pos)
          return EditorSelection.normalized(ranges.slice(), mainIndex);
        pos = range.to;
      }
      return new EditorSelection(ranges, mainIndex);
    }
    static cursor(pos, assoc = 0, bidiLevel, goalColumn) {
      return SelectionRange.create(pos, pos, (assoc == 0 ? 0 : assoc < 0 ? 4 : 8) | (bidiLevel == null ? 3 : Math.min(2, bidiLevel)) | (goalColumn !== null && goalColumn !== void 0 ? goalColumn : 33554431) << 5);
    }
    static range(anchor, head, goalColumn) {
      let goal = (goalColumn !== null && goalColumn !== void 0 ? goalColumn : 33554431) << 5;
      return head < anchor ? SelectionRange.create(head, anchor, 16 | goal | 8) : SelectionRange.create(anchor, head, goal | (head > anchor ? 4 : 0));
    }
    static normalized(ranges, mainIndex = 0) {
      let main = ranges[mainIndex];
      ranges.sort((a, b) => a.from - b.from);
      mainIndex = ranges.indexOf(main);
      for (let i = 1; i < ranges.length; i++) {
        let range = ranges[i], prev = ranges[i - 1];
        if (range.empty ? range.from <= prev.to : range.from < prev.to) {
          let from = prev.from, to = Math.max(range.to, prev.to);
          if (i <= mainIndex)
            mainIndex--;
          ranges.splice(--i, 2, range.anchor > range.head ? EditorSelection.range(to, from) : EditorSelection.range(from, to));
        }
      }
      return new EditorSelection(ranges, mainIndex);
    }
  };
  function checkSelection(selection, docLength) {
    for (let range of selection.ranges)
      if (range.to > docLength)
        throw new RangeError("Selection points outside of document");
  }
  var nextID = 0;
  var Facet = class {
    constructor(combine, compareInput, compare2, isStatic, enables) {
      this.combine = combine;
      this.compareInput = compareInput;
      this.compare = compare2;
      this.isStatic = isStatic;
      this.id = nextID++;
      this.default = combine([]);
      this.extensions = typeof enables == "function" ? enables(this) : enables;
    }
    static define(config = {}) {
      return new Facet(config.combine || ((a) => a), config.compareInput || ((a, b) => a === b), config.compare || (!config.combine ? sameArray : (a, b) => a === b), !!config.static, config.enables);
    }
    of(value) {
      return new FacetProvider([], this, 0, value);
    }
    compute(deps, get) {
      if (this.isStatic)
        throw new Error("Can't compute a static facet");
      return new FacetProvider(deps, this, 1, get);
    }
    computeN(deps, get) {
      if (this.isStatic)
        throw new Error("Can't compute a static facet");
      return new FacetProvider(deps, this, 2, get);
    }
    from(field, get) {
      if (!get)
        get = (x) => x;
      return this.compute([field], (state) => get(state.field(field)));
    }
  };
  function sameArray(a, b) {
    return a == b || a.length == b.length && a.every((e, i) => e === b[i]);
  }
  var FacetProvider = class {
    constructor(dependencies, facet, type, value) {
      this.dependencies = dependencies;
      this.facet = facet;
      this.type = type;
      this.value = value;
      this.id = nextID++;
    }
    dynamicSlot(addresses) {
      var _a2;
      let getter = this.value;
      let compare2 = this.facet.compareInput;
      let id2 = this.id, idx = addresses[id2] >> 1, multi = this.type == 2;
      let depDoc = false, depSel = false, depAddrs = [];
      for (let dep of this.dependencies) {
        if (dep == "doc")
          depDoc = true;
        else if (dep == "selection")
          depSel = true;
        else if ((((_a2 = addresses[dep.id]) !== null && _a2 !== void 0 ? _a2 : 1) & 1) == 0)
          depAddrs.push(addresses[dep.id]);
      }
      return {
        create(state) {
          state.values[idx] = getter(state);
          return 1;
        },
        update(state, tr) {
          if (depDoc && tr.docChanged || depSel && (tr.docChanged || tr.selection) || ensureAll(state, depAddrs)) {
            let newVal = getter(state);
            if (multi ? !compareArray(newVal, state.values[idx], compare2) : !compare2(newVal, state.values[idx])) {
              state.values[idx] = newVal;
              return 1;
            }
          }
          return 0;
        },
        reconfigure: (state, oldState) => {
          let newVal, oldAddr = oldState.config.address[id2];
          if (oldAddr != null) {
            let oldVal = getAddr(oldState, oldAddr);
            if (this.dependencies.every((dep) => {
              return dep instanceof Facet ? oldState.facet(dep) === state.facet(dep) : dep instanceof StateField ? oldState.field(dep, false) == state.field(dep, false) : true;
            }) || (multi ? compareArray(newVal = getter(state), oldVal, compare2) : compare2(newVal = getter(state), oldVal))) {
              state.values[idx] = oldVal;
              return 0;
            }
          } else {
            newVal = getter(state);
          }
          state.values[idx] = newVal;
          return 1;
        }
      };
    }
  };
  function compareArray(a, b, compare2) {
    if (a.length != b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (!compare2(a[i], b[i]))
        return false;
    return true;
  }
  function ensureAll(state, addrs) {
    let changed = false;
    for (let addr of addrs)
      if (ensureAddr(state, addr) & 1)
        changed = true;
    return changed;
  }
  function dynamicFacetSlot(addresses, facet, providers) {
    let providerAddrs = providers.map((p) => addresses[p.id]);
    let providerTypes = providers.map((p) => p.type);
    let dynamic = providerAddrs.filter((p) => !(p & 1));
    let idx = addresses[facet.id] >> 1;
    function get(state) {
      let values2 = [];
      for (let i = 0; i < providerAddrs.length; i++) {
        let value = getAddr(state, providerAddrs[i]);
        if (providerTypes[i] == 2)
          for (let val of value)
            values2.push(val);
        else
          values2.push(value);
      }
      return facet.combine(values2);
    }
    return {
      create(state) {
        for (let addr of providerAddrs)
          ensureAddr(state, addr);
        state.values[idx] = get(state);
        return 1;
      },
      update(state, tr) {
        if (!ensureAll(state, dynamic))
          return 0;
        let value = get(state);
        if (facet.compare(value, state.values[idx]))
          return 0;
        state.values[idx] = value;
        return 1;
      },
      reconfigure(state, oldState) {
        let depChanged = ensureAll(state, providerAddrs);
        let oldProviders = oldState.config.facets[facet.id], oldValue = oldState.facet(facet);
        if (oldProviders && !depChanged && sameArray(providers, oldProviders)) {
          state.values[idx] = oldValue;
          return 0;
        }
        let value = get(state);
        if (facet.compare(value, oldValue)) {
          state.values[idx] = oldValue;
          return 0;
        }
        state.values[idx] = value;
        return 1;
      }
    };
  }
  var initField = /* @__PURE__ */ Facet.define({static: true});
  var StateField = class {
    constructor(id2, createF, updateF, compareF, spec) {
      this.id = id2;
      this.createF = createF;
      this.updateF = updateF;
      this.compareF = compareF;
      this.spec = spec;
      this.provides = void 0;
    }
    static define(config) {
      let field = new StateField(nextID++, config.create, config.update, config.compare || ((a, b) => a === b), config);
      if (config.provide)
        field.provides = config.provide(field);
      return field;
    }
    create(state) {
      let init = state.facet(initField).find((i) => i.field == this);
      return ((init === null || init === void 0 ? void 0 : init.create) || this.createF)(state);
    }
    slot(addresses) {
      let idx = addresses[this.id] >> 1;
      return {
        create: (state) => {
          state.values[idx] = this.create(state);
          return 1;
        },
        update: (state, tr) => {
          let oldVal = state.values[idx];
          let value = this.updateF(oldVal, tr);
          if (this.compareF(oldVal, value))
            return 0;
          state.values[idx] = value;
          return 1;
        },
        reconfigure: (state, oldState) => {
          if (oldState.config.address[this.id] != null) {
            state.values[idx] = oldState.field(this);
            return 0;
          }
          state.values[idx] = this.create(state);
          return 1;
        }
      };
    }
    init(create) {
      return [this, initField.of({field: this, create})];
    }
    get extension() {
      return this;
    }
  };
  var Prec_ = {lowest: 4, low: 3, default: 2, high: 1, highest: 0};
  function prec(value) {
    return (ext) => new PrecExtension(ext, value);
  }
  var Prec = {
    highest: /* @__PURE__ */ prec(Prec_.highest),
    high: /* @__PURE__ */ prec(Prec_.high),
    default: /* @__PURE__ */ prec(Prec_.default),
    low: /* @__PURE__ */ prec(Prec_.low),
    lowest: /* @__PURE__ */ prec(Prec_.lowest)
  };
  var PrecExtension = class {
    constructor(inner, prec2) {
      this.inner = inner;
      this.prec = prec2;
    }
  };
  var Compartment = class {
    of(ext) {
      return new CompartmentInstance(this, ext);
    }
    reconfigure(content2) {
      return Compartment.reconfigure.of({compartment: this, extension: content2});
    }
    get(state) {
      return state.config.compartments.get(this);
    }
  };
  var CompartmentInstance = class {
    constructor(compartment, inner) {
      this.compartment = compartment;
      this.inner = inner;
    }
  };
  var Configuration = class {
    constructor(base2, compartments, dynamicSlots, address, staticValues, facets) {
      this.base = base2;
      this.compartments = compartments;
      this.dynamicSlots = dynamicSlots;
      this.address = address;
      this.staticValues = staticValues;
      this.facets = facets;
      this.statusTemplate = [];
      while (this.statusTemplate.length < dynamicSlots.length)
        this.statusTemplate.push(0);
    }
    staticFacet(facet) {
      let addr = this.address[facet.id];
      return addr == null ? facet.default : this.staticValues[addr >> 1];
    }
    static resolve(base2, compartments, oldState) {
      let fields = [];
      let facets = Object.create(null);
      let newCompartments = new Map();
      for (let ext of flatten(base2, compartments, newCompartments)) {
        if (ext instanceof StateField)
          fields.push(ext);
        else
          (facets[ext.facet.id] || (facets[ext.facet.id] = [])).push(ext);
      }
      let address = Object.create(null);
      let staticValues = [];
      let dynamicSlots = [];
      for (let field of fields) {
        address[field.id] = dynamicSlots.length << 1;
        dynamicSlots.push((a) => field.slot(a));
      }
      let oldFacets = oldState === null || oldState === void 0 ? void 0 : oldState.config.facets;
      for (let id2 in facets) {
        let providers = facets[id2], facet = providers[0].facet;
        let oldProviders = oldFacets && oldFacets[id2] || [];
        if (providers.every((p) => p.type == 0)) {
          address[facet.id] = staticValues.length << 1 | 1;
          if (sameArray(oldProviders, providers)) {
            staticValues.push(oldState.facet(facet));
          } else {
            let value = facet.combine(providers.map((p) => p.value));
            staticValues.push(oldState && facet.compare(value, oldState.facet(facet)) ? oldState.facet(facet) : value);
          }
        } else {
          for (let p of providers) {
            if (p.type == 0) {
              address[p.id] = staticValues.length << 1 | 1;
              staticValues.push(p.value);
            } else {
              address[p.id] = dynamicSlots.length << 1;
              dynamicSlots.push((a) => p.dynamicSlot(a));
            }
          }
          address[facet.id] = dynamicSlots.length << 1;
          dynamicSlots.push((a) => dynamicFacetSlot(a, facet, providers));
        }
      }
      let dynamic = dynamicSlots.map((f) => f(address));
      return new Configuration(base2, newCompartments, dynamic, address, staticValues, facets);
    }
  };
  function flatten(extension, compartments, newCompartments) {
    let result = [[], [], [], [], []];
    let seen = new Map();
    function inner(ext, prec2) {
      let known = seen.get(ext);
      if (known != null) {
        if (known <= prec2)
          return;
        let found = result[known].indexOf(ext);
        if (found > -1)
          result[known].splice(found, 1);
        if (ext instanceof CompartmentInstance)
          newCompartments.delete(ext.compartment);
      }
      seen.set(ext, prec2);
      if (Array.isArray(ext)) {
        for (let e of ext)
          inner(e, prec2);
      } else if (ext instanceof CompartmentInstance) {
        if (newCompartments.has(ext.compartment))
          throw new RangeError(`Duplicate use of compartment in extensions`);
        let content2 = compartments.get(ext.compartment) || ext.inner;
        newCompartments.set(ext.compartment, content2);
        inner(content2, prec2);
      } else if (ext instanceof PrecExtension) {
        inner(ext.inner, ext.prec);
      } else if (ext instanceof StateField) {
        result[prec2].push(ext);
        if (ext.provides)
          inner(ext.provides, prec2);
      } else if (ext instanceof FacetProvider) {
        result[prec2].push(ext);
        if (ext.facet.extensions)
          inner(ext.facet.extensions, Prec_.default);
      } else {
        let content2 = ext.extension;
        if (!content2)
          throw new Error(`Unrecognized extension value in extension set (${ext}). This sometimes happens because multiple instances of @codemirror/state are loaded, breaking instanceof checks.`);
        inner(content2, prec2);
      }
    }
    inner(extension, Prec_.default);
    return result.reduce((a, b) => a.concat(b));
  }
  function ensureAddr(state, addr) {
    if (addr & 1)
      return 2;
    let idx = addr >> 1;
    let status = state.status[idx];
    if (status == 4)
      throw new Error("Cyclic dependency between fields and/or facets");
    if (status & 2)
      return status;
    state.status[idx] = 4;
    let changed = state.computeSlot(state, state.config.dynamicSlots[idx]);
    return state.status[idx] = 2 | changed;
  }
  function getAddr(state, addr) {
    return addr & 1 ? state.config.staticValues[addr >> 1] : state.values[addr >> 1];
  }
  var languageData = /* @__PURE__ */ Facet.define();
  var allowMultipleSelections = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.some((v) => v),
    static: true
  });
  var lineSeparator = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.length ? values2[0] : void 0,
    static: true
  });
  var changeFilter = /* @__PURE__ */ Facet.define();
  var transactionFilter = /* @__PURE__ */ Facet.define();
  var transactionExtender = /* @__PURE__ */ Facet.define();
  var readOnly = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.length ? values2[0] : false
  });
  var Annotation = class {
    constructor(type, value) {
      this.type = type;
      this.value = value;
    }
    static define() {
      return new AnnotationType();
    }
  };
  var AnnotationType = class {
    of(value) {
      return new Annotation(this, value);
    }
  };
  var StateEffectType = class {
    constructor(map) {
      this.map = map;
    }
    of(value) {
      return new StateEffect(this, value);
    }
  };
  var StateEffect = class {
    constructor(type, value) {
      this.type = type;
      this.value = value;
    }
    map(mapping) {
      let mapped = this.type.map(this.value, mapping);
      return mapped === void 0 ? void 0 : mapped == this.value ? this : new StateEffect(this.type, mapped);
    }
    is(type) {
      return this.type == type;
    }
    static define(spec = {}) {
      return new StateEffectType(spec.map || ((v) => v));
    }
    static mapEffects(effects, mapping) {
      if (!effects.length)
        return effects;
      let result = [];
      for (let effect of effects) {
        let mapped = effect.map(mapping);
        if (mapped)
          result.push(mapped);
      }
      return result;
    }
  };
  StateEffect.reconfigure = /* @__PURE__ */ StateEffect.define();
  StateEffect.appendConfig = /* @__PURE__ */ StateEffect.define();
  var Transaction = class {
    constructor(startState, changes, selection, effects, annotations, scrollIntoView3) {
      this.startState = startState;
      this.changes = changes;
      this.selection = selection;
      this.effects = effects;
      this.annotations = annotations;
      this.scrollIntoView = scrollIntoView3;
      this._doc = null;
      this._state = null;
      if (selection)
        checkSelection(selection, changes.newLength);
      if (!annotations.some((a) => a.type == Transaction.time))
        this.annotations = annotations.concat(Transaction.time.of(Date.now()));
    }
    static create(startState, changes, selection, effects, annotations, scrollIntoView3) {
      return new Transaction(startState, changes, selection, effects, annotations, scrollIntoView3);
    }
    get newDoc() {
      return this._doc || (this._doc = this.changes.apply(this.startState.doc));
    }
    get newSelection() {
      return this.selection || this.startState.selection.map(this.changes);
    }
    get state() {
      if (!this._state)
        this.startState.applyTransaction(this);
      return this._state;
    }
    annotation(type) {
      for (let ann of this.annotations)
        if (ann.type == type)
          return ann.value;
      return void 0;
    }
    get docChanged() {
      return !this.changes.empty;
    }
    get reconfigured() {
      return this.startState.config != this.state.config;
    }
    isUserEvent(event) {
      let e = this.annotation(Transaction.userEvent);
      return !!(e && (e == event || e.length > event.length && e.slice(0, event.length) == event && e[event.length] == "."));
    }
  };
  Transaction.time = /* @__PURE__ */ Annotation.define();
  Transaction.userEvent = /* @__PURE__ */ Annotation.define();
  Transaction.addToHistory = /* @__PURE__ */ Annotation.define();
  Transaction.remote = /* @__PURE__ */ Annotation.define();
  function joinRanges(a, b) {
    let result = [];
    for (let iA = 0, iB = 0; ; ) {
      let from, to;
      if (iA < a.length && (iB == b.length || b[iB] >= a[iA])) {
        from = a[iA++];
        to = a[iA++];
      } else if (iB < b.length) {
        from = b[iB++];
        to = b[iB++];
      } else
        return result;
      if (!result.length || result[result.length - 1] < from)
        result.push(from, to);
      else if (result[result.length - 1] < to)
        result[result.length - 1] = to;
    }
  }
  function mergeTransaction(a, b, sequential) {
    var _a2;
    let mapForA, mapForB, changes;
    if (sequential) {
      mapForA = b.changes;
      mapForB = ChangeSet.empty(b.changes.length);
      changes = a.changes.compose(b.changes);
    } else {
      mapForA = b.changes.map(a.changes);
      mapForB = a.changes.mapDesc(b.changes, true);
      changes = a.changes.compose(mapForA);
    }
    return {
      changes,
      selection: b.selection ? b.selection.map(mapForB) : (_a2 = a.selection) === null || _a2 === void 0 ? void 0 : _a2.map(mapForA),
      effects: StateEffect.mapEffects(a.effects, mapForA).concat(StateEffect.mapEffects(b.effects, mapForB)),
      annotations: a.annotations.length ? a.annotations.concat(b.annotations) : b.annotations,
      scrollIntoView: a.scrollIntoView || b.scrollIntoView
    };
  }
  function resolveTransactionInner(state, spec, docSize) {
    let sel = spec.selection, annotations = asArray(spec.annotations);
    if (spec.userEvent)
      annotations = annotations.concat(Transaction.userEvent.of(spec.userEvent));
    return {
      changes: spec.changes instanceof ChangeSet ? spec.changes : ChangeSet.of(spec.changes || [], docSize, state.facet(lineSeparator)),
      selection: sel && (sel instanceof EditorSelection ? sel : EditorSelection.single(sel.anchor, sel.head)),
      effects: asArray(spec.effects),
      annotations,
      scrollIntoView: !!spec.scrollIntoView
    };
  }
  function resolveTransaction(state, specs, filter) {
    let s = resolveTransactionInner(state, specs.length ? specs[0] : {}, state.doc.length);
    if (specs.length && specs[0].filter === false)
      filter = false;
    for (let i = 1; i < specs.length; i++) {
      if (specs[i].filter === false)
        filter = false;
      let seq = !!specs[i].sequential;
      s = mergeTransaction(s, resolveTransactionInner(state, specs[i], seq ? s.changes.newLength : state.doc.length), seq);
    }
    let tr = Transaction.create(state, s.changes, s.selection, s.effects, s.annotations, s.scrollIntoView);
    return extendTransaction(filter ? filterTransaction(tr) : tr);
  }
  function filterTransaction(tr) {
    let state = tr.startState;
    let result = true;
    for (let filter of state.facet(changeFilter)) {
      let value = filter(tr);
      if (value === false) {
        result = false;
        break;
      }
      if (Array.isArray(value))
        result = result === true ? value : joinRanges(result, value);
    }
    if (result !== true) {
      let changes, back;
      if (result === false) {
        back = tr.changes.invertedDesc;
        changes = ChangeSet.empty(state.doc.length);
      } else {
        let filtered = tr.changes.filter(result);
        changes = filtered.changes;
        back = filtered.filtered.mapDesc(filtered.changes).invertedDesc;
      }
      tr = Transaction.create(state, changes, tr.selection && tr.selection.map(back), StateEffect.mapEffects(tr.effects, back), tr.annotations, tr.scrollIntoView);
    }
    let filters = state.facet(transactionFilter);
    for (let i = filters.length - 1; i >= 0; i--) {
      let filtered = filters[i](tr);
      if (filtered instanceof Transaction)
        tr = filtered;
      else if (Array.isArray(filtered) && filtered.length == 1 && filtered[0] instanceof Transaction)
        tr = filtered[0];
      else
        tr = resolveTransaction(state, asArray(filtered), false);
    }
    return tr;
  }
  function extendTransaction(tr) {
    let state = tr.startState, extenders = state.facet(transactionExtender), spec = tr;
    for (let i = extenders.length - 1; i >= 0; i--) {
      let extension = extenders[i](tr);
      if (extension && Object.keys(extension).length)
        spec = mergeTransaction(spec, resolveTransactionInner(state, extension, tr.changes.newLength), true);
    }
    return spec == tr ? tr : Transaction.create(state, tr.changes, tr.selection, spec.effects, spec.annotations, spec.scrollIntoView);
  }
  var none = [];
  function asArray(value) {
    return value == null ? none : Array.isArray(value) ? value : [value];
  }
  var CharCategory = /* @__PURE__ */ function(CharCategory2) {
    CharCategory2[CharCategory2["Word"] = 0] = "Word";
    CharCategory2[CharCategory2["Space"] = 1] = "Space";
    CharCategory2[CharCategory2["Other"] = 2] = "Other";
    return CharCategory2;
  }(CharCategory || (CharCategory = {}));
  var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
  var wordChar;
  try {
    wordChar = /* @__PURE__ */ new RegExp("[\\p{Alphabetic}\\p{Number}_]", "u");
  } catch (_) {
  }
  function hasWordChar(str) {
    if (wordChar)
      return wordChar.test(str);
    for (let i = 0; i < str.length; i++) {
      let ch = str[i];
      if (/\w/.test(ch) || ch > "\x80" && (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch)))
        return true;
    }
    return false;
  }
  function makeCategorizer(wordChars) {
    return (char) => {
      if (!/\S/.test(char))
        return CharCategory.Space;
      if (hasWordChar(char))
        return CharCategory.Word;
      for (let i = 0; i < wordChars.length; i++)
        if (char.indexOf(wordChars[i]) > -1)
          return CharCategory.Word;
      return CharCategory.Other;
    };
  }
  var EditorState = class {
    constructor(config, doc2, selection, values2, computeSlot, tr) {
      this.config = config;
      this.doc = doc2;
      this.selection = selection;
      this.values = values2;
      this.status = config.statusTemplate.slice();
      this.computeSlot = computeSlot;
      if (tr)
        tr._state = this;
      for (let i = 0; i < this.config.dynamicSlots.length; i++)
        ensureAddr(this, i << 1);
      this.computeSlot = null;
    }
    field(field, require2 = true) {
      let addr = this.config.address[field.id];
      if (addr == null) {
        if (require2)
          throw new RangeError("Field is not present in this state");
        return void 0;
      }
      ensureAddr(this, addr);
      return getAddr(this, addr);
    }
    update(...specs) {
      return resolveTransaction(this, specs, true);
    }
    applyTransaction(tr) {
      let conf = this.config, {base: base2, compartments} = conf;
      for (let effect of tr.effects) {
        if (effect.is(Compartment.reconfigure)) {
          if (conf) {
            compartments = new Map();
            conf.compartments.forEach((val, key) => compartments.set(key, val));
            conf = null;
          }
          compartments.set(effect.value.compartment, effect.value.extension);
        } else if (effect.is(StateEffect.reconfigure)) {
          conf = null;
          base2 = effect.value;
        } else if (effect.is(StateEffect.appendConfig)) {
          conf = null;
          base2 = asArray(base2).concat(effect.value);
        }
      }
      let startValues;
      if (!conf) {
        conf = Configuration.resolve(base2, compartments, this);
        let intermediateState = new EditorState(conf, this.doc, this.selection, conf.dynamicSlots.map(() => null), (state, slot) => slot.reconfigure(state, this), null);
        startValues = intermediateState.values;
      } else {
        startValues = tr.startState.values.slice();
      }
      new EditorState(conf, tr.newDoc, tr.newSelection, startValues, (state, slot) => slot.update(state, tr), tr);
    }
    replaceSelection(text) {
      if (typeof text == "string")
        text = this.toText(text);
      return this.changeByRange((range) => ({
        changes: {from: range.from, to: range.to, insert: text},
        range: EditorSelection.cursor(range.from + text.length)
      }));
    }
    changeByRange(f) {
      let sel = this.selection;
      let result1 = f(sel.ranges[0]);
      let changes = this.changes(result1.changes), ranges = [result1.range];
      let effects = asArray(result1.effects);
      for (let i = 1; i < sel.ranges.length; i++) {
        let result = f(sel.ranges[i]);
        let newChanges = this.changes(result.changes), newMapped = newChanges.map(changes);
        for (let j = 0; j < i; j++)
          ranges[j] = ranges[j].map(newMapped);
        let mapBy = changes.mapDesc(newChanges, true);
        ranges.push(result.range.map(mapBy));
        changes = changes.compose(newMapped);
        effects = StateEffect.mapEffects(effects, newMapped).concat(StateEffect.mapEffects(asArray(result.effects), mapBy));
      }
      return {
        changes,
        selection: EditorSelection.create(ranges, sel.mainIndex),
        effects
      };
    }
    changes(spec = []) {
      if (spec instanceof ChangeSet)
        return spec;
      return ChangeSet.of(spec, this.doc.length, this.facet(EditorState.lineSeparator));
    }
    toText(string2) {
      return Text.of(string2.split(this.facet(EditorState.lineSeparator) || DefaultSplit));
    }
    sliceDoc(from = 0, to = this.doc.length) {
      return this.doc.sliceString(from, to, this.lineBreak);
    }
    facet(facet) {
      let addr = this.config.address[facet.id];
      if (addr == null)
        return facet.default;
      ensureAddr(this, addr);
      return getAddr(this, addr);
    }
    toJSON(fields) {
      let result = {
        doc: this.sliceDoc(),
        selection: this.selection.toJSON()
      };
      if (fields)
        for (let prop in fields) {
          let value = fields[prop];
          if (value instanceof StateField && this.config.address[value.id] != null)
            result[prop] = value.spec.toJSON(this.field(fields[prop]), this);
        }
      return result;
    }
    static fromJSON(json2, config = {}, fields) {
      if (!json2 || typeof json2.doc != "string")
        throw new RangeError("Invalid JSON representation for EditorState");
      let fieldInit = [];
      if (fields)
        for (let prop in fields) {
          if (Object.prototype.hasOwnProperty.call(json2, prop)) {
            let field = fields[prop], value = json2[prop];
            fieldInit.push(field.init((state) => field.spec.fromJSON(value, state)));
          }
        }
      return EditorState.create({
        doc: json2.doc,
        selection: EditorSelection.fromJSON(json2.selection),
        extensions: config.extensions ? fieldInit.concat([config.extensions]) : fieldInit
      });
    }
    static create(config = {}) {
      let configuration = Configuration.resolve(config.extensions || [], new Map());
      let doc2 = config.doc instanceof Text ? config.doc : Text.of((config.doc || "").split(configuration.staticFacet(EditorState.lineSeparator) || DefaultSplit));
      let selection = !config.selection ? EditorSelection.single(0) : config.selection instanceof EditorSelection ? config.selection : EditorSelection.single(config.selection.anchor, config.selection.head);
      checkSelection(selection, doc2.length);
      if (!configuration.staticFacet(allowMultipleSelections))
        selection = selection.asSingle();
      return new EditorState(configuration, doc2, selection, configuration.dynamicSlots.map(() => null), (state, slot) => slot.create(state), null);
    }
    get tabSize() {
      return this.facet(EditorState.tabSize);
    }
    get lineBreak() {
      return this.facet(EditorState.lineSeparator) || "\n";
    }
    get readOnly() {
      return this.facet(readOnly);
    }
    phrase(phrase, ...insert2) {
      for (let map of this.facet(EditorState.phrases))
        if (Object.prototype.hasOwnProperty.call(map, phrase)) {
          phrase = map[phrase];
          break;
        }
      if (insert2.length)
        phrase = phrase.replace(/\$(\$|\d*)/g, (m, i) => {
          if (i == "$")
            return "$";
          let n = +(i || 1);
          return !n || n > insert2.length ? m : insert2[n - 1];
        });
      return phrase;
    }
    languageDataAt(name2, pos, side = -1) {
      let values2 = [];
      for (let provider of this.facet(languageData)) {
        for (let result of provider(this, pos, side)) {
          if (Object.prototype.hasOwnProperty.call(result, name2))
            values2.push(result[name2]);
        }
      }
      return values2;
    }
    charCategorizer(at) {
      return makeCategorizer(this.languageDataAt("wordChars", at).join(""));
    }
    wordAt(pos) {
      let {text, from, length} = this.doc.lineAt(pos);
      let cat = this.charCategorizer(pos);
      let start = pos - from, end = pos - from;
      while (start > 0) {
        let prev = findClusterBreak(text, start, false);
        if (cat(text.slice(prev, start)) != CharCategory.Word)
          break;
        start = prev;
      }
      while (end < length) {
        let next = findClusterBreak(text, end);
        if (cat(text.slice(end, next)) != CharCategory.Word)
          break;
        end = next;
      }
      return start == end ? null : EditorSelection.range(start + from, end + from);
    }
  };
  EditorState.allowMultipleSelections = allowMultipleSelections;
  EditorState.tabSize = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.length ? values2[0] : 4
  });
  EditorState.lineSeparator = lineSeparator;
  EditorState.readOnly = readOnly;
  EditorState.phrases = /* @__PURE__ */ Facet.define({
    compare(a, b) {
      let kA = Object.keys(a), kB = Object.keys(b);
      return kA.length == kB.length && kA.every((k) => a[k] == b[k]);
    }
  });
  EditorState.languageData = languageData;
  EditorState.changeFilter = changeFilter;
  EditorState.transactionFilter = transactionFilter;
  EditorState.transactionExtender = transactionExtender;
  Compartment.reconfigure = /* @__PURE__ */ StateEffect.define();
  function combineConfig(configs, defaults, combine = {}) {
    let result = {};
    for (let config of configs)
      for (let key of Object.keys(config)) {
        let value = config[key], current = result[key];
        if (current === void 0)
          result[key] = value;
        else if (current === value || value === void 0)
          ;
        else if (Object.hasOwnProperty.call(combine, key))
          result[key] = combine[key](current, value);
        else
          throw new Error("Config merge conflict for field " + key);
      }
    for (let key in defaults)
      if (result[key] === void 0)
        result[key] = defaults[key];
    return result;
  }
  var RangeValue = class {
    eq(other) {
      return this == other;
    }
    range(from, to = from) {
      return Range.create(from, to, this);
    }
  };
  RangeValue.prototype.startSide = RangeValue.prototype.endSide = 0;
  RangeValue.prototype.point = false;
  RangeValue.prototype.mapMode = MapMode.TrackDel;
  var Range = class {
    constructor(from, to, value) {
      this.from = from;
      this.to = to;
      this.value = value;
    }
    static create(from, to, value) {
      return new Range(from, to, value);
    }
  };
  function cmpRange(a, b) {
    return a.from - b.from || a.value.startSide - b.value.startSide;
  }
  var Chunk = class {
    constructor(from, to, value, maxPoint) {
      this.from = from;
      this.to = to;
      this.value = value;
      this.maxPoint = maxPoint;
    }
    get length() {
      return this.to[this.to.length - 1];
    }
    findIndex(pos, side, end, startAt = 0) {
      let arr = end ? this.to : this.from;
      for (let lo = startAt, hi = arr.length; ; ) {
        if (lo == hi)
          return lo;
        let mid = lo + hi >> 1;
        let diff = arr[mid] - pos || (end ? this.value[mid].endSide : this.value[mid].startSide) - side;
        if (mid == lo)
          return diff >= 0 ? lo : hi;
        if (diff >= 0)
          hi = mid;
        else
          lo = mid + 1;
      }
    }
    between(offset, from, to, f) {
      for (let i = this.findIndex(from, -1e9, true), e = this.findIndex(to, 1e9, false, i); i < e; i++)
        if (f(this.from[i] + offset, this.to[i] + offset, this.value[i]) === false)
          return false;
    }
    map(offset, changes) {
      let value = [], from = [], to = [], newPos = -1, maxPoint = -1;
      for (let i = 0; i < this.value.length; i++) {
        let val = this.value[i], curFrom = this.from[i] + offset, curTo = this.to[i] + offset, newFrom, newTo;
        if (curFrom == curTo) {
          let mapped = changes.mapPos(curFrom, val.startSide, val.mapMode);
          if (mapped == null)
            continue;
          newFrom = newTo = mapped;
          if (val.startSide != val.endSide) {
            newTo = changes.mapPos(curFrom, val.endSide);
            if (newTo < newFrom)
              continue;
          }
        } else {
          newFrom = changes.mapPos(curFrom, val.startSide);
          newTo = changes.mapPos(curTo, val.endSide);
          if (newFrom > newTo || newFrom == newTo && val.startSide > 0 && val.endSide <= 0)
            continue;
        }
        if ((newTo - newFrom || val.endSide - val.startSide) < 0)
          continue;
        if (newPos < 0)
          newPos = newFrom;
        if (val.point)
          maxPoint = Math.max(maxPoint, newTo - newFrom);
        value.push(val);
        from.push(newFrom - newPos);
        to.push(newTo - newPos);
      }
      return {mapped: value.length ? new Chunk(from, to, value, maxPoint) : null, pos: newPos};
    }
  };
  var RangeSet = class {
    constructor(chunkPos, chunk, nextLayer, maxPoint) {
      this.chunkPos = chunkPos;
      this.chunk = chunk;
      this.nextLayer = nextLayer;
      this.maxPoint = maxPoint;
    }
    static create(chunkPos, chunk, nextLayer, maxPoint) {
      return new RangeSet(chunkPos, chunk, nextLayer, maxPoint);
    }
    get length() {
      let last = this.chunk.length - 1;
      return last < 0 ? 0 : Math.max(this.chunkEnd(last), this.nextLayer.length);
    }
    get size() {
      if (this.isEmpty)
        return 0;
      let size = this.nextLayer.size;
      for (let chunk of this.chunk)
        size += chunk.value.length;
      return size;
    }
    chunkEnd(index) {
      return this.chunkPos[index] + this.chunk[index].length;
    }
    update(updateSpec) {
      let {add = [], sort = false, filterFrom = 0, filterTo = this.length} = updateSpec;
      let filter = updateSpec.filter;
      if (add.length == 0 && !filter)
        return this;
      if (sort)
        add = add.slice().sort(cmpRange);
      if (this.isEmpty)
        return add.length ? RangeSet.of(add) : this;
      let cur2 = new LayerCursor(this, null, -1).goto(0), i = 0, spill = [];
      let builder = new RangeSetBuilder();
      while (cur2.value || i < add.length) {
        if (i < add.length && (cur2.from - add[i].from || cur2.startSide - add[i].value.startSide) >= 0) {
          let range = add[i++];
          if (!builder.addInner(range.from, range.to, range.value))
            spill.push(range);
        } else if (cur2.rangeIndex == 1 && cur2.chunkIndex < this.chunk.length && (i == add.length || this.chunkEnd(cur2.chunkIndex) < add[i].from) && (!filter || filterFrom > this.chunkEnd(cur2.chunkIndex) || filterTo < this.chunkPos[cur2.chunkIndex]) && builder.addChunk(this.chunkPos[cur2.chunkIndex], this.chunk[cur2.chunkIndex])) {
          cur2.nextChunk();
        } else {
          if (!filter || filterFrom > cur2.to || filterTo < cur2.from || filter(cur2.from, cur2.to, cur2.value)) {
            if (!builder.addInner(cur2.from, cur2.to, cur2.value))
              spill.push(Range.create(cur2.from, cur2.to, cur2.value));
          }
          cur2.next();
        }
      }
      return builder.finishInner(this.nextLayer.isEmpty && !spill.length ? RangeSet.empty : this.nextLayer.update({add: spill, filter, filterFrom, filterTo}));
    }
    map(changes) {
      if (changes.empty || this.isEmpty)
        return this;
      let chunks = [], chunkPos = [], maxPoint = -1;
      for (let i = 0; i < this.chunk.length; i++) {
        let start = this.chunkPos[i], chunk = this.chunk[i];
        let touch = changes.touchesRange(start, start + chunk.length);
        if (touch === false) {
          maxPoint = Math.max(maxPoint, chunk.maxPoint);
          chunks.push(chunk);
          chunkPos.push(changes.mapPos(start));
        } else if (touch === true) {
          let {mapped, pos} = chunk.map(start, changes);
          if (mapped) {
            maxPoint = Math.max(maxPoint, mapped.maxPoint);
            chunks.push(mapped);
            chunkPos.push(pos);
          }
        }
      }
      let next = this.nextLayer.map(changes);
      return chunks.length == 0 ? next : new RangeSet(chunkPos, chunks, next || RangeSet.empty, maxPoint);
    }
    between(from, to, f) {
      if (this.isEmpty)
        return;
      for (let i = 0; i < this.chunk.length; i++) {
        let start = this.chunkPos[i], chunk = this.chunk[i];
        if (to >= start && from <= start + chunk.length && chunk.between(start, from - start, to - start, f) === false)
          return;
      }
      this.nextLayer.between(from, to, f);
    }
    iter(from = 0) {
      return HeapCursor.from([this]).goto(from);
    }
    get isEmpty() {
      return this.nextLayer == this;
    }
    static iter(sets, from = 0) {
      return HeapCursor.from(sets).goto(from);
    }
    static compare(oldSets, newSets, textDiff, comparator, minPointSize = -1) {
      let a = oldSets.filter((set) => set.maxPoint > 0 || !set.isEmpty && set.maxPoint >= minPointSize);
      let b = newSets.filter((set) => set.maxPoint > 0 || !set.isEmpty && set.maxPoint >= minPointSize);
      let sharedChunks = findSharedChunks(a, b, textDiff);
      let sideA = new SpanCursor(a, sharedChunks, minPointSize);
      let sideB = new SpanCursor(b, sharedChunks, minPointSize);
      textDiff.iterGaps((fromA, fromB, length) => compare(sideA, fromA, sideB, fromB, length, comparator));
      if (textDiff.empty && textDiff.length == 0)
        compare(sideA, 0, sideB, 0, 0, comparator);
    }
    static eq(oldSets, newSets, from = 0, to) {
      if (to == null)
        to = 1e9 - 1;
      let a = oldSets.filter((set) => !set.isEmpty && newSets.indexOf(set) < 0);
      let b = newSets.filter((set) => !set.isEmpty && oldSets.indexOf(set) < 0);
      if (a.length != b.length)
        return false;
      if (!a.length)
        return true;
      let sharedChunks = findSharedChunks(a, b);
      let sideA = new SpanCursor(a, sharedChunks, 0).goto(from), sideB = new SpanCursor(b, sharedChunks, 0).goto(from);
      for (; ; ) {
        if (sideA.to != sideB.to || !sameValues(sideA.active, sideB.active) || sideA.point && (!sideB.point || !sideA.point.eq(sideB.point)))
          return false;
        if (sideA.to > to)
          return true;
        sideA.next();
        sideB.next();
      }
    }
    static spans(sets, from, to, iterator, minPointSize = -1) {
      let cursor = new SpanCursor(sets, null, minPointSize).goto(from), pos = from;
      let open = cursor.openStart;
      for (; ; ) {
        let curTo = Math.min(cursor.to, to);
        if (cursor.point) {
          iterator.point(pos, curTo, cursor.point, cursor.activeForPoint(cursor.to), open, cursor.pointRank);
          open = cursor.openEnd(curTo) + (cursor.to > curTo ? 1 : 0);
        } else if (curTo > pos) {
          iterator.span(pos, curTo, cursor.active, open);
          open = cursor.openEnd(curTo);
        }
        if (cursor.to > to)
          break;
        pos = cursor.to;
        cursor.next();
      }
      return open;
    }
    static of(ranges, sort = false) {
      let build = new RangeSetBuilder();
      for (let range of ranges instanceof Range ? [ranges] : sort ? lazySort(ranges) : ranges)
        build.add(range.from, range.to, range.value);
      return build.finish();
    }
  };
  RangeSet.empty = /* @__PURE__ */ new RangeSet([], [], null, -1);
  function lazySort(ranges) {
    if (ranges.length > 1)
      for (let prev = ranges[0], i = 1; i < ranges.length; i++) {
        let cur2 = ranges[i];
        if (cmpRange(prev, cur2) > 0)
          return ranges.slice().sort(cmpRange);
        prev = cur2;
      }
    return ranges;
  }
  RangeSet.empty.nextLayer = RangeSet.empty;
  var RangeSetBuilder = class {
    constructor() {
      this.chunks = [];
      this.chunkPos = [];
      this.chunkStart = -1;
      this.last = null;
      this.lastFrom = -1e9;
      this.lastTo = -1e9;
      this.from = [];
      this.to = [];
      this.value = [];
      this.maxPoint = -1;
      this.setMaxPoint = -1;
      this.nextLayer = null;
    }
    finishChunk(newArrays) {
      this.chunks.push(new Chunk(this.from, this.to, this.value, this.maxPoint));
      this.chunkPos.push(this.chunkStart);
      this.chunkStart = -1;
      this.setMaxPoint = Math.max(this.setMaxPoint, this.maxPoint);
      this.maxPoint = -1;
      if (newArrays) {
        this.from = [];
        this.to = [];
        this.value = [];
      }
    }
    add(from, to, value) {
      if (!this.addInner(from, to, value))
        (this.nextLayer || (this.nextLayer = new RangeSetBuilder())).add(from, to, value);
    }
    addInner(from, to, value) {
      let diff = from - this.lastTo || value.startSide - this.last.endSide;
      if (diff <= 0 && (from - this.lastFrom || value.startSide - this.last.startSide) < 0)
        throw new Error("Ranges must be added sorted by `from` position and `startSide`");
      if (diff < 0)
        return false;
      if (this.from.length == 250)
        this.finishChunk(true);
      if (this.chunkStart < 0)
        this.chunkStart = from;
      this.from.push(from - this.chunkStart);
      this.to.push(to - this.chunkStart);
      this.last = value;
      this.lastFrom = from;
      this.lastTo = to;
      this.value.push(value);
      if (value.point)
        this.maxPoint = Math.max(this.maxPoint, to - from);
      return true;
    }
    addChunk(from, chunk) {
      if ((from - this.lastTo || chunk.value[0].startSide - this.last.endSide) < 0)
        return false;
      if (this.from.length)
        this.finishChunk(true);
      this.setMaxPoint = Math.max(this.setMaxPoint, chunk.maxPoint);
      this.chunks.push(chunk);
      this.chunkPos.push(from);
      let last = chunk.value.length - 1;
      this.last = chunk.value[last];
      this.lastFrom = chunk.from[last] + from;
      this.lastTo = chunk.to[last] + from;
      return true;
    }
    finish() {
      return this.finishInner(RangeSet.empty);
    }
    finishInner(next) {
      if (this.from.length)
        this.finishChunk(false);
      if (this.chunks.length == 0)
        return next;
      let result = RangeSet.create(this.chunkPos, this.chunks, this.nextLayer ? this.nextLayer.finishInner(next) : next, this.setMaxPoint);
      this.from = null;
      return result;
    }
  };
  function findSharedChunks(a, b, textDiff) {
    let inA = new Map();
    for (let set of a)
      for (let i = 0; i < set.chunk.length; i++)
        if (set.chunk[i].maxPoint <= 0)
          inA.set(set.chunk[i], set.chunkPos[i]);
    let shared = new Set();
    for (let set of b)
      for (let i = 0; i < set.chunk.length; i++) {
        let known = inA.get(set.chunk[i]);
        if (known != null && (textDiff ? textDiff.mapPos(known) : known) == set.chunkPos[i] && !(textDiff === null || textDiff === void 0 ? void 0 : textDiff.touchesRange(known, known + set.chunk[i].length)))
          shared.add(set.chunk[i]);
      }
    return shared;
  }
  var LayerCursor = class {
    constructor(layer, skip, minPoint, rank = 0) {
      this.layer = layer;
      this.skip = skip;
      this.minPoint = minPoint;
      this.rank = rank;
    }
    get startSide() {
      return this.value ? this.value.startSide : 0;
    }
    get endSide() {
      return this.value ? this.value.endSide : 0;
    }
    goto(pos, side = -1e9) {
      this.chunkIndex = this.rangeIndex = 0;
      this.gotoInner(pos, side, false);
      return this;
    }
    gotoInner(pos, side, forward) {
      while (this.chunkIndex < this.layer.chunk.length) {
        let next = this.layer.chunk[this.chunkIndex];
        if (!(this.skip && this.skip.has(next) || this.layer.chunkEnd(this.chunkIndex) < pos || next.maxPoint < this.minPoint))
          break;
        this.chunkIndex++;
        forward = false;
      }
      if (this.chunkIndex < this.layer.chunk.length) {
        let rangeIndex = this.layer.chunk[this.chunkIndex].findIndex(pos - this.layer.chunkPos[this.chunkIndex], side, true);
        if (!forward || this.rangeIndex < rangeIndex)
          this.setRangeIndex(rangeIndex);
      }
      this.next();
    }
    forward(pos, side) {
      if ((this.to - pos || this.endSide - side) < 0)
        this.gotoInner(pos, side, true);
    }
    next() {
      for (; ; ) {
        if (this.chunkIndex == this.layer.chunk.length) {
          this.from = this.to = 1e9;
          this.value = null;
          break;
        } else {
          let chunkPos = this.layer.chunkPos[this.chunkIndex], chunk = this.layer.chunk[this.chunkIndex];
          let from = chunkPos + chunk.from[this.rangeIndex];
          this.from = from;
          this.to = chunkPos + chunk.to[this.rangeIndex];
          this.value = chunk.value[this.rangeIndex];
          this.setRangeIndex(this.rangeIndex + 1);
          if (this.minPoint < 0 || this.value.point && this.to - this.from >= this.minPoint)
            break;
        }
      }
    }
    setRangeIndex(index) {
      if (index == this.layer.chunk[this.chunkIndex].value.length) {
        this.chunkIndex++;
        if (this.skip) {
          while (this.chunkIndex < this.layer.chunk.length && this.skip.has(this.layer.chunk[this.chunkIndex]))
            this.chunkIndex++;
        }
        this.rangeIndex = 0;
      } else {
        this.rangeIndex = index;
      }
    }
    nextChunk() {
      this.chunkIndex++;
      this.rangeIndex = 0;
      this.next();
    }
    compare(other) {
      return this.from - other.from || this.startSide - other.startSide || this.rank - other.rank || this.to - other.to || this.endSide - other.endSide;
    }
  };
  var HeapCursor = class {
    constructor(heap) {
      this.heap = heap;
    }
    static from(sets, skip = null, minPoint = -1) {
      let heap = [];
      for (let i = 0; i < sets.length; i++) {
        for (let cur2 = sets[i]; !cur2.isEmpty; cur2 = cur2.nextLayer) {
          if (cur2.maxPoint >= minPoint)
            heap.push(new LayerCursor(cur2, skip, minPoint, i));
        }
      }
      return heap.length == 1 ? heap[0] : new HeapCursor(heap);
    }
    get startSide() {
      return this.value ? this.value.startSide : 0;
    }
    goto(pos, side = -1e9) {
      for (let cur2 of this.heap)
        cur2.goto(pos, side);
      for (let i = this.heap.length >> 1; i >= 0; i--)
        heapBubble(this.heap, i);
      this.next();
      return this;
    }
    forward(pos, side) {
      for (let cur2 of this.heap)
        cur2.forward(pos, side);
      for (let i = this.heap.length >> 1; i >= 0; i--)
        heapBubble(this.heap, i);
      if ((this.to - pos || this.value.endSide - side) < 0)
        this.next();
    }
    next() {
      if (this.heap.length == 0) {
        this.from = this.to = 1e9;
        this.value = null;
        this.rank = -1;
      } else {
        let top2 = this.heap[0];
        this.from = top2.from;
        this.to = top2.to;
        this.value = top2.value;
        this.rank = top2.rank;
        if (top2.value)
          top2.next();
        heapBubble(this.heap, 0);
      }
    }
  };
  function heapBubble(heap, index) {
    for (let cur2 = heap[index]; ; ) {
      let childIndex = (index << 1) + 1;
      if (childIndex >= heap.length)
        break;
      let child = heap[childIndex];
      if (childIndex + 1 < heap.length && child.compare(heap[childIndex + 1]) >= 0) {
        child = heap[childIndex + 1];
        childIndex++;
      }
      if (cur2.compare(child) < 0)
        break;
      heap[childIndex] = cur2;
      heap[index] = child;
      index = childIndex;
    }
  }
  var SpanCursor = class {
    constructor(sets, skip, minPoint) {
      this.minPoint = minPoint;
      this.active = [];
      this.activeTo = [];
      this.activeRank = [];
      this.minActive = -1;
      this.point = null;
      this.pointFrom = 0;
      this.pointRank = 0;
      this.to = -1e9;
      this.endSide = 0;
      this.openStart = -1;
      this.cursor = HeapCursor.from(sets, skip, minPoint);
    }
    goto(pos, side = -1e9) {
      this.cursor.goto(pos, side);
      this.active.length = this.activeTo.length = this.activeRank.length = 0;
      this.minActive = -1;
      this.to = pos;
      this.endSide = side;
      this.openStart = -1;
      this.next();
      return this;
    }
    forward(pos, side) {
      while (this.minActive > -1 && (this.activeTo[this.minActive] - pos || this.active[this.minActive].endSide - side) < 0)
        this.removeActive(this.minActive);
      this.cursor.forward(pos, side);
    }
    removeActive(index) {
      remove(this.active, index);
      remove(this.activeTo, index);
      remove(this.activeRank, index);
      this.minActive = findMinIndex(this.active, this.activeTo);
    }
    addActive(trackOpen) {
      let i = 0, {value, to, rank} = this.cursor;
      while (i < this.activeRank.length && this.activeRank[i] <= rank)
        i++;
      insert(this.active, i, value);
      insert(this.activeTo, i, to);
      insert(this.activeRank, i, rank);
      if (trackOpen)
        insert(trackOpen, i, this.cursor.from);
      this.minActive = findMinIndex(this.active, this.activeTo);
    }
    next() {
      let from = this.to, wasPoint = this.point;
      this.point = null;
      let trackOpen = this.openStart < 0 ? [] : null, trackExtra = 0;
      for (; ; ) {
        let a = this.minActive;
        if (a > -1 && (this.activeTo[a] - this.cursor.from || this.active[a].endSide - this.cursor.startSide) < 0) {
          if (this.activeTo[a] > from) {
            this.to = this.activeTo[a];
            this.endSide = this.active[a].endSide;
            break;
          }
          this.removeActive(a);
          if (trackOpen)
            remove(trackOpen, a);
        } else if (!this.cursor.value) {
          this.to = this.endSide = 1e9;
          break;
        } else if (this.cursor.from > from) {
          this.to = this.cursor.from;
          this.endSide = this.cursor.startSide;
          break;
        } else {
          let nextVal = this.cursor.value;
          if (!nextVal.point) {
            this.addActive(trackOpen);
            if (this.cursor.from < from && this.cursor.to > from)
              trackExtra++;
            this.cursor.next();
          } else if (wasPoint && this.cursor.to == this.to && this.cursor.from < this.cursor.to) {
            this.cursor.next();
          } else {
            this.point = nextVal;
            this.pointFrom = this.cursor.from;
            this.pointRank = this.cursor.rank;
            this.to = this.cursor.to;
            this.endSide = nextVal.endSide;
            if (this.cursor.from < from)
              trackExtra = 1;
            this.cursor.next();
            this.forward(this.to, this.endSide);
            break;
          }
        }
      }
      if (trackOpen) {
        let openStart = 0;
        while (openStart < trackOpen.length && trackOpen[openStart] < from)
          openStart++;
        this.openStart = openStart + trackExtra;
      }
    }
    activeForPoint(to) {
      if (!this.active.length)
        return this.active;
      let active = [];
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (this.activeRank[i] < this.pointRank)
          break;
        if (this.activeTo[i] > to || this.activeTo[i] == to && this.active[i].endSide >= this.point.endSide)
          active.push(this.active[i]);
      }
      return active.reverse();
    }
    openEnd(to) {
      let open = 0;
      for (let i = this.activeTo.length - 1; i >= 0 && this.activeTo[i] > to; i--)
        open++;
      return open;
    }
  };
  function compare(a, startA, b, startB, length, comparator) {
    a.goto(startA);
    b.goto(startB);
    let endB = startB + length;
    let pos = startB, dPos = startB - startA;
    for (; ; ) {
      let diff = a.to + dPos - b.to || a.endSide - b.endSide;
      let end = diff < 0 ? a.to + dPos : b.to, clipEnd = Math.min(end, endB);
      if (a.point || b.point) {
        if (!(a.point && b.point && (a.point == b.point || a.point.eq(b.point)) && sameValues(a.activeForPoint(a.to + dPos), b.activeForPoint(b.to))))
          comparator.comparePoint(pos, clipEnd, a.point, b.point);
      } else {
        if (clipEnd > pos && !sameValues(a.active, b.active))
          comparator.compareRange(pos, clipEnd, a.active, b.active);
      }
      if (end > endB)
        break;
      pos = end;
      if (diff <= 0)
        a.next();
      if (diff >= 0)
        b.next();
    }
  }
  function sameValues(a, b) {
    if (a.length != b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (a[i] != b[i] && !a[i].eq(b[i]))
        return false;
    return true;
  }
  function remove(array, index) {
    for (let i = index, e = array.length - 1; i < e; i++)
      array[i] = array[i + 1];
    array.pop();
  }
  function insert(array, index, value) {
    for (let i = array.length - 1; i >= index; i--)
      array[i + 1] = array[i];
    array[index] = value;
  }
  function findMinIndex(value, array) {
    let found = -1, foundPos = 1e9;
    for (let i = 0; i < array.length; i++)
      if ((array[i] - foundPos || value[i].endSide - value[found].endSide) < 0) {
        found = i;
        foundPos = array[i];
      }
    return found;
  }
  function countColumn(string2, tabSize, to = string2.length) {
    let n = 0;
    for (let i = 0; i < to; ) {
      if (string2.charCodeAt(i) == 9) {
        n += tabSize - n % tabSize;
        i++;
      } else {
        n++;
        i = findClusterBreak(string2, i);
      }
    }
    return n;
  }
  function findColumn(string2, col, tabSize, strict) {
    for (let i = 0, n = 0; ; ) {
      if (n >= col)
        return i;
      if (i == string2.length)
        break;
      n += string2.charCodeAt(i) == 9 ? tabSize - n % tabSize : 1;
      i = findClusterBreak(string2, i);
    }
    return strict === true ? -1 : string2.length;
  }

  // node_modules/style-mod/src/style-mod.js
  var C = "\u037C";
  var COUNT = typeof Symbol == "undefined" ? "__" + C : Symbol.for(C);
  var SET = typeof Symbol == "undefined" ? "__styleSet" + Math.floor(Math.random() * 1e8) : Symbol("styleSet");
  var top = typeof globalThis != "undefined" ? globalThis : typeof window != "undefined" ? window : {};
  var StyleModule = class {
    constructor(spec, options) {
      this.rules = [];
      let {finish} = options || {};
      function splitSelector(selector) {
        return /^@/.test(selector) ? [selector] : selector.split(/,\s*/);
      }
      function render(selectors, spec2, target, isKeyframes) {
        let local = [], isAt = /^@(\w+)\b/.exec(selectors[0]), keyframes = isAt && isAt[1] == "keyframes";
        if (isAt && spec2 == null)
          return target.push(selectors[0] + ";");
        for (let prop in spec2) {
          let value = spec2[prop];
          if (/&/.test(prop)) {
            render(prop.split(/,\s*/).map((part) => selectors.map((sel) => part.replace(/&/, sel))).reduce((a, b) => a.concat(b)), value, target);
          } else if (value && typeof value == "object") {
            if (!isAt)
              throw new RangeError("The value of a property (" + prop + ") should be a primitive value.");
            render(splitSelector(prop), value, local, keyframes);
          } else if (value != null) {
            local.push(prop.replace(/_.*/, "").replace(/[A-Z]/g, (l) => "-" + l.toLowerCase()) + ": " + value + ";");
          }
        }
        if (local.length || keyframes) {
          target.push((finish && !isAt && !isKeyframes ? selectors.map(finish) : selectors).join(", ") + " {" + local.join(" ") + "}");
        }
      }
      for (let prop in spec)
        render(splitSelector(prop), spec[prop], this.rules);
    }
    getRules() {
      return this.rules.join("\n");
    }
    static newName() {
      let id2 = top[COUNT] || 1;
      top[COUNT] = id2 + 1;
      return C + id2.toString(36);
    }
    static mount(root, modules) {
      (root[SET] || new StyleSet(root)).mount(Array.isArray(modules) ? modules : [modules]);
    }
  };
  var adoptedSet = null;
  var StyleSet = class {
    constructor(root) {
      if (!root.head && root.adoptedStyleSheets && typeof CSSStyleSheet != "undefined") {
        if (adoptedSet) {
          root.adoptedStyleSheets = [adoptedSet.sheet].concat(root.adoptedStyleSheets);
          return root[SET] = adoptedSet;
        }
        this.sheet = new CSSStyleSheet();
        root.adoptedStyleSheets = [this.sheet].concat(root.adoptedStyleSheets);
        adoptedSet = this;
      } else {
        this.styleTag = (root.ownerDocument || root).createElement("style");
        let target = root.head || root;
        target.insertBefore(this.styleTag, target.firstChild);
      }
      this.modules = [];
      root[SET] = this;
    }
    mount(modules) {
      let sheet = this.sheet;
      let pos = 0, j = 0;
      for (let i = 0; i < modules.length; i++) {
        let mod = modules[i], index = this.modules.indexOf(mod);
        if (index < j && index > -1) {
          this.modules.splice(index, 1);
          j--;
          index = -1;
        }
        if (index == -1) {
          this.modules.splice(j++, 0, mod);
          if (sheet)
            for (let k = 0; k < mod.rules.length; k++)
              sheet.insertRule(mod.rules[k], pos++);
        } else {
          while (j < index)
            pos += this.modules[j++].rules.length;
          pos += mod.rules.length;
          j++;
        }
      }
      if (!sheet) {
        let text = "";
        for (let i = 0; i < this.modules.length; i++)
          text += this.modules[i].getRules() + "\n";
        this.styleTag.textContent = text;
      }
    }
  };

  // node_modules/w3c-keyname/index.es.js
  var base = {
    8: "Backspace",
    9: "Tab",
    10: "Enter",
    12: "NumLock",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    44: "PrintScreen",
    45: "Insert",
    46: "Delete",
    59: ";",
    61: "=",
    91: "Meta",
    92: "Meta",
    106: "*",
    107: "+",
    108: ",",
    109: "-",
    110: ".",
    111: "/",
    144: "NumLock",
    145: "ScrollLock",
    160: "Shift",
    161: "Shift",
    162: "Control",
    163: "Control",
    164: "Alt",
    165: "Alt",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'"
  };
  var shift = {
    48: ")",
    49: "!",
    50: "@",
    51: "#",
    52: "$",
    53: "%",
    54: "^",
    55: "&",
    56: "*",
    57: "(",
    59: ":",
    61: "+",
    173: "_",
    186: ":",
    187: "+",
    188: "<",
    189: "_",
    190: ">",
    191: "?",
    192: "~",
    219: "{",
    220: "|",
    221: "}",
    222: '"'
  };
  var chrome = typeof navigator != "undefined" && /Chrome\/(\d+)/.exec(navigator.userAgent);
  var gecko = typeof navigator != "undefined" && /Gecko\/\d+/.test(navigator.userAgent);
  var mac = typeof navigator != "undefined" && /Mac/.test(navigator.platform);
  var ie = typeof navigator != "undefined" && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
  var brokenModifierNames = mac || chrome && +chrome[1] < 57;
  for (var i = 0; i < 10; i++)
    base[48 + i] = base[96 + i] = String(i);
  for (var i = 1; i <= 24; i++)
    base[i + 111] = "F" + i;
  for (var i = 65; i <= 90; i++) {
    base[i] = String.fromCharCode(i + 32);
    shift[i] = String.fromCharCode(i);
  }
  for (var code in base)
    if (!shift.hasOwnProperty(code))
      shift[code] = base[code];
  function keyName(event) {
    var ignoreKey = brokenModifierNames && (event.ctrlKey || event.altKey || event.metaKey) || ie && event.shiftKey && event.key && event.key.length == 1 || event.key == "Unidentified";
    var name2 = !ignoreKey && event.key || (event.shiftKey ? shift : base)[event.keyCode] || event.key || "Unidentified";
    if (name2 == "Esc")
      name2 = "Escape";
    if (name2 == "Del")
      name2 = "Delete";
    if (name2 == "Left")
      name2 = "ArrowLeft";
    if (name2 == "Up")
      name2 = "ArrowUp";
    if (name2 == "Right")
      name2 = "ArrowRight";
    if (name2 == "Down")
      name2 = "ArrowDown";
    return name2;
  }

  // node_modules/@codemirror/view/dist/index.js
  function getSelection(root) {
    let target;
    if (root.nodeType == 11) {
      target = root.getSelection ? root : root.ownerDocument;
    } else {
      target = root;
    }
    return target.getSelection();
  }
  function contains(dom, node) {
    return node ? dom == node || dom.contains(node.nodeType != 1 ? node.parentNode : node) : false;
  }
  function deepActiveElement(doc2) {
    let elt2 = doc2.activeElement;
    while (elt2 && elt2.shadowRoot)
      elt2 = elt2.shadowRoot.activeElement;
    return elt2;
  }
  function hasSelection(dom, selection) {
    if (!selection.anchorNode)
      return false;
    try {
      return contains(dom, selection.anchorNode);
    } catch (_) {
      return false;
    }
  }
  function clientRectsFor(dom) {
    if (dom.nodeType == 3)
      return textRange(dom, 0, dom.nodeValue.length).getClientRects();
    else if (dom.nodeType == 1)
      return dom.getClientRects();
    else
      return [];
  }
  function isEquivalentPosition(node, off, targetNode, targetOff) {
    return targetNode ? scanFor(node, off, targetNode, targetOff, -1) || scanFor(node, off, targetNode, targetOff, 1) : false;
  }
  function domIndex(node) {
    for (var index = 0; ; index++) {
      node = node.previousSibling;
      if (!node)
        return index;
    }
  }
  function scanFor(node, off, targetNode, targetOff, dir) {
    for (; ; ) {
      if (node == targetNode && off == targetOff)
        return true;
      if (off == (dir < 0 ? 0 : maxOffset(node))) {
        if (node.nodeName == "DIV")
          return false;
        let parent = node.parentNode;
        if (!parent || parent.nodeType != 1)
          return false;
        off = domIndex(node) + (dir < 0 ? 0 : 1);
        node = parent;
      } else if (node.nodeType == 1) {
        node = node.childNodes[off + (dir < 0 ? -1 : 0)];
        if (node.nodeType == 1 && node.contentEditable == "false")
          return false;
        off = dir < 0 ? maxOffset(node) : 0;
      } else {
        return false;
      }
    }
  }
  function maxOffset(node) {
    return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  var Rect0 = {left: 0, right: 0, top: 0, bottom: 0};
  function flattenRect(rect, left) {
    let x = left ? rect.left : rect.right;
    return {left: x, right: x, top: rect.top, bottom: rect.bottom};
  }
  function windowRect(win) {
    return {
      left: 0,
      right: win.innerWidth,
      top: 0,
      bottom: win.innerHeight
    };
  }
  function scrollRectIntoView(dom, rect, side, x, y, xMargin, yMargin, ltr) {
    let doc2 = dom.ownerDocument, win = doc2.defaultView || window;
    for (let cur2 = dom; cur2; ) {
      if (cur2.nodeType == 1) {
        let bounding, top2 = cur2 == doc2.body;
        if (top2) {
          bounding = windowRect(win);
        } else {
          if (cur2.scrollHeight <= cur2.clientHeight && cur2.scrollWidth <= cur2.clientWidth) {
            cur2 = cur2.assignedSlot || cur2.parentNode;
            continue;
          }
          let rect2 = cur2.getBoundingClientRect();
          bounding = {
            left: rect2.left,
            right: rect2.left + cur2.clientWidth,
            top: rect2.top,
            bottom: rect2.top + cur2.clientHeight
          };
        }
        let moveX = 0, moveY = 0;
        if (y == "nearest") {
          if (rect.top < bounding.top) {
            moveY = -(bounding.top - rect.top + yMargin);
            if (side > 0 && rect.bottom > bounding.bottom + moveY)
              moveY = rect.bottom - bounding.bottom + moveY + yMargin;
          } else if (rect.bottom > bounding.bottom) {
            moveY = rect.bottom - bounding.bottom + yMargin;
            if (side < 0 && rect.top - moveY < bounding.top)
              moveY = -(bounding.top + moveY - rect.top + yMargin);
          }
        } else {
          let rectHeight = rect.bottom - rect.top, boundingHeight = bounding.bottom - bounding.top;
          let targetTop = y == "center" && rectHeight <= boundingHeight ? rect.top + rectHeight / 2 - boundingHeight / 2 : y == "start" || y == "center" && side < 0 ? rect.top - yMargin : rect.bottom - boundingHeight + yMargin;
          moveY = targetTop - bounding.top;
        }
        if (x == "nearest") {
          if (rect.left < bounding.left) {
            moveX = -(bounding.left - rect.left + xMargin);
            if (side > 0 && rect.right > bounding.right + moveX)
              moveX = rect.right - bounding.right + moveX + xMargin;
          } else if (rect.right > bounding.right) {
            moveX = rect.right - bounding.right + xMargin;
            if (side < 0 && rect.left < bounding.left + moveX)
              moveX = -(bounding.left + moveX - rect.left + xMargin);
          }
        } else {
          let targetLeft = x == "center" ? rect.left + (rect.right - rect.left) / 2 - (bounding.right - bounding.left) / 2 : x == "start" == ltr ? rect.left - xMargin : rect.right - (bounding.right - bounding.left) + xMargin;
          moveX = targetLeft - bounding.left;
        }
        if (moveX || moveY) {
          if (top2) {
            win.scrollBy(moveX, moveY);
          } else {
            let movedX = 0, movedY = 0;
            if (moveY) {
              let start = cur2.scrollTop;
              cur2.scrollTop += moveY;
              movedY = cur2.scrollTop - start;
            }
            if (moveX) {
              let start = cur2.scrollLeft;
              cur2.scrollLeft += moveX;
              movedX = cur2.scrollLeft - start;
            }
            rect = {
              left: rect.left - movedX,
              top: rect.top - movedY,
              right: rect.right - movedX,
              bottom: rect.bottom - movedY
            };
            if (movedX && Math.abs(movedX - moveX) < 1)
              x = "nearest";
            if (movedY && Math.abs(movedY - moveY) < 1)
              y = "nearest";
          }
        }
        if (top2)
          break;
        cur2 = cur2.assignedSlot || cur2.parentNode;
      } else if (cur2.nodeType == 11) {
        cur2 = cur2.host;
      } else {
        break;
      }
    }
  }
  var DOMSelectionState = class {
    constructor() {
      this.anchorNode = null;
      this.anchorOffset = 0;
      this.focusNode = null;
      this.focusOffset = 0;
    }
    eq(domSel) {
      return this.anchorNode == domSel.anchorNode && this.anchorOffset == domSel.anchorOffset && this.focusNode == domSel.focusNode && this.focusOffset == domSel.focusOffset;
    }
    setRange(range) {
      this.set(range.anchorNode, range.anchorOffset, range.focusNode, range.focusOffset);
    }
    set(anchorNode, anchorOffset, focusNode, focusOffset) {
      this.anchorNode = anchorNode;
      this.anchorOffset = anchorOffset;
      this.focusNode = focusNode;
      this.focusOffset = focusOffset;
    }
  };
  var preventScrollSupported = null;
  function focusPreventScroll(dom) {
    if (dom.setActive)
      return dom.setActive();
    if (preventScrollSupported)
      return dom.focus(preventScrollSupported);
    let stack = [];
    for (let cur2 = dom; cur2; cur2 = cur2.parentNode) {
      stack.push(cur2, cur2.scrollTop, cur2.scrollLeft);
      if (cur2 == cur2.ownerDocument)
        break;
    }
    dom.focus(preventScrollSupported == null ? {
      get preventScroll() {
        preventScrollSupported = {preventScroll: true};
        return true;
      }
    } : void 0);
    if (!preventScrollSupported) {
      preventScrollSupported = false;
      for (let i = 0; i < stack.length; ) {
        let elt2 = stack[i++], top2 = stack[i++], left = stack[i++];
        if (elt2.scrollTop != top2)
          elt2.scrollTop = top2;
        if (elt2.scrollLeft != left)
          elt2.scrollLeft = left;
      }
    }
  }
  var scratchRange;
  function textRange(node, from, to = from) {
    let range = scratchRange || (scratchRange = document.createRange());
    range.setEnd(node, to);
    range.setStart(node, from);
    return range;
  }
  function dispatchKey(elt2, name2, code) {
    let options = {key: name2, code: name2, keyCode: code, which: code, cancelable: true};
    let down = new KeyboardEvent("keydown", options);
    down.synthetic = true;
    elt2.dispatchEvent(down);
    let up = new KeyboardEvent("keyup", options);
    up.synthetic = true;
    elt2.dispatchEvent(up);
    return down.defaultPrevented || up.defaultPrevented;
  }
  function getRoot(node) {
    while (node) {
      if (node && (node.nodeType == 9 || node.nodeType == 11 && node.host))
        return node;
      node = node.assignedSlot || node.parentNode;
    }
    return null;
  }
  function clearAttributes(node) {
    while (node.attributes.length)
      node.removeAttributeNode(node.attributes[0]);
  }
  function atElementStart(doc2, selection) {
    let node = selection.focusNode, offset = selection.focusOffset;
    if (!node || selection.anchorNode != node || selection.anchorOffset != offset)
      return false;
    for (; ; ) {
      if (offset) {
        if (node.nodeType != 1)
          return false;
        let prev = node.childNodes[offset - 1];
        if (prev.contentEditable == "false")
          offset--;
        else {
          node = prev;
          offset = maxOffset(node);
        }
      } else if (node == doc2) {
        return true;
      } else {
        offset = domIndex(node);
        node = node.parentNode;
      }
    }
  }
  var DOMPos = class {
    constructor(node, offset, precise = true) {
      this.node = node;
      this.offset = offset;
      this.precise = precise;
    }
    static before(dom, precise) {
      return new DOMPos(dom.parentNode, domIndex(dom), precise);
    }
    static after(dom, precise) {
      return new DOMPos(dom.parentNode, domIndex(dom) + 1, precise);
    }
  };
  var noChildren = [];
  var ContentView = class {
    constructor() {
      this.parent = null;
      this.dom = null;
      this.dirty = 2;
    }
    get editorView() {
      if (!this.parent)
        throw new Error("Accessing view in orphan content view");
      return this.parent.editorView;
    }
    get overrideDOMText() {
      return null;
    }
    get posAtStart() {
      return this.parent ? this.parent.posBefore(this) : 0;
    }
    get posAtEnd() {
      return this.posAtStart + this.length;
    }
    posBefore(view) {
      let pos = this.posAtStart;
      for (let child of this.children) {
        if (child == view)
          return pos;
        pos += child.length + child.breakAfter;
      }
      throw new RangeError("Invalid child in posBefore");
    }
    posAfter(view) {
      return this.posBefore(view) + view.length;
    }
    coordsAt(_pos, _side) {
      return null;
    }
    sync(track) {
      if (this.dirty & 2) {
        let parent = this.dom;
        let prev = null, next;
        for (let child of this.children) {
          if (child.dirty) {
            if (!child.dom && (next = prev ? prev.nextSibling : parent.firstChild)) {
              let contentView = ContentView.get(next);
              if (!contentView || !contentView.parent && contentView.canReuseDOM(child))
                child.reuseDOM(next);
            }
            child.sync(track);
            child.dirty = 0;
          }
          next = prev ? prev.nextSibling : parent.firstChild;
          if (track && !track.written && track.node == parent && next != child.dom)
            track.written = true;
          if (child.dom.parentNode == parent) {
            while (next && next != child.dom)
              next = rm$1(next);
          } else {
            parent.insertBefore(child.dom, next);
          }
          prev = child.dom;
        }
        next = prev ? prev.nextSibling : parent.firstChild;
        if (next && track && track.node == parent)
          track.written = true;
        while (next)
          next = rm$1(next);
      } else if (this.dirty & 1) {
        for (let child of this.children)
          if (child.dirty) {
            child.sync(track);
            child.dirty = 0;
          }
      }
    }
    reuseDOM(_dom) {
    }
    localPosFromDOM(node, offset) {
      let after;
      if (node == this.dom) {
        after = this.dom.childNodes[offset];
      } else {
        let bias = maxOffset(node) == 0 ? 0 : offset == 0 ? -1 : 1;
        for (; ; ) {
          let parent = node.parentNode;
          if (parent == this.dom)
            break;
          if (bias == 0 && parent.firstChild != parent.lastChild) {
            if (node == parent.firstChild)
              bias = -1;
            else
              bias = 1;
          }
          node = parent;
        }
        if (bias < 0)
          after = node;
        else
          after = node.nextSibling;
      }
      if (after == this.dom.firstChild)
        return 0;
      while (after && !ContentView.get(after))
        after = after.nextSibling;
      if (!after)
        return this.length;
      for (let i = 0, pos = 0; ; i++) {
        let child = this.children[i];
        if (child.dom == after)
          return pos;
        pos += child.length + child.breakAfter;
      }
    }
    domBoundsAround(from, to, offset = 0) {
      let fromI = -1, fromStart = -1, toI = -1, toEnd = -1;
      for (let i = 0, pos = offset, prevEnd = offset; i < this.children.length; i++) {
        let child = this.children[i], end = pos + child.length;
        if (pos < from && end > to)
          return child.domBoundsAround(from, to, pos);
        if (end >= from && fromI == -1) {
          fromI = i;
          fromStart = pos;
        }
        if (pos > to && child.dom.parentNode == this.dom) {
          toI = i;
          toEnd = prevEnd;
          break;
        }
        prevEnd = end;
        pos = end + child.breakAfter;
      }
      return {
        from: fromStart,
        to: toEnd < 0 ? offset + this.length : toEnd,
        startDOM: (fromI ? this.children[fromI - 1].dom.nextSibling : null) || this.dom.firstChild,
        endDOM: toI < this.children.length && toI >= 0 ? this.children[toI].dom : null
      };
    }
    markDirty(andParent = false) {
      this.dirty |= 2;
      this.markParentsDirty(andParent);
    }
    markParentsDirty(childList) {
      for (let parent = this.parent; parent; parent = parent.parent) {
        if (childList)
          parent.dirty |= 2;
        if (parent.dirty & 1)
          return;
        parent.dirty |= 1;
        childList = false;
      }
    }
    setParent(parent) {
      if (this.parent != parent) {
        this.parent = parent;
        if (this.dirty)
          this.markParentsDirty(true);
      }
    }
    setDOM(dom) {
      if (this.dom)
        this.dom.cmView = null;
      this.dom = dom;
      dom.cmView = this;
    }
    get rootView() {
      for (let v = this; ; ) {
        let parent = v.parent;
        if (!parent)
          return v;
        v = parent;
      }
    }
    replaceChildren(from, to, children = noChildren) {
      this.markDirty();
      for (let i = from; i < to; i++) {
        let child = this.children[i];
        if (child.parent == this)
          child.destroy();
      }
      this.children.splice(from, to - from, ...children);
      for (let i = 0; i < children.length; i++)
        children[i].setParent(this);
    }
    ignoreMutation(_rec) {
      return false;
    }
    ignoreEvent(_event) {
      return false;
    }
    childCursor(pos = this.length) {
      return new ChildCursor(this.children, pos, this.children.length);
    }
    childPos(pos, bias = 1) {
      return this.childCursor().findPos(pos, bias);
    }
    toString() {
      let name2 = this.constructor.name.replace("View", "");
      return name2 + (this.children.length ? "(" + this.children.join() + ")" : this.length ? "[" + (name2 == "Text" ? this.text : this.length) + "]" : "") + (this.breakAfter ? "#" : "");
    }
    static get(node) {
      return node.cmView;
    }
    get isEditable() {
      return true;
    }
    merge(from, to, source, hasStart, openStart, openEnd) {
      return false;
    }
    become(other) {
      return false;
    }
    canReuseDOM(other) {
      return other.constructor == this.constructor;
    }
    getSide() {
      return 0;
    }
    destroy() {
      this.parent = null;
    }
  };
  ContentView.prototype.breakAfter = 0;
  function rm$1(dom) {
    let next = dom.nextSibling;
    dom.parentNode.removeChild(dom);
    return next;
  }
  var ChildCursor = class {
    constructor(children, pos, i) {
      this.children = children;
      this.pos = pos;
      this.i = i;
      this.off = 0;
    }
    findPos(pos, bias = 1) {
      for (; ; ) {
        if (pos > this.pos || pos == this.pos && (bias > 0 || this.i == 0 || this.children[this.i - 1].breakAfter)) {
          this.off = pos - this.pos;
          return this;
        }
        let next = this.children[--this.i];
        this.pos -= next.length + next.breakAfter;
      }
    }
  };
  function replaceRange(parent, fromI, fromOff, toI, toOff, insert2, breakAtStart, openStart, openEnd) {
    let {children} = parent;
    let before = children.length ? children[fromI] : null;
    let last = insert2.length ? insert2[insert2.length - 1] : null;
    let breakAtEnd = last ? last.breakAfter : breakAtStart;
    if (fromI == toI && before && !breakAtStart && !breakAtEnd && insert2.length < 2 && before.merge(fromOff, toOff, insert2.length ? last : null, fromOff == 0, openStart, openEnd))
      return;
    if (toI < children.length) {
      let after = children[toI];
      if (after && toOff < after.length) {
        if (fromI == toI) {
          after = after.split(toOff);
          toOff = 0;
        }
        if (!breakAtEnd && last && after.merge(0, toOff, last, true, 0, openEnd)) {
          insert2[insert2.length - 1] = after;
        } else {
          if (toOff)
            after.merge(0, toOff, null, false, 0, openEnd);
          insert2.push(after);
        }
      } else if (after === null || after === void 0 ? void 0 : after.breakAfter) {
        if (last)
          last.breakAfter = 1;
        else
          breakAtStart = 1;
      }
      toI++;
    }
    if (before) {
      before.breakAfter = breakAtStart;
      if (fromOff > 0) {
        if (!breakAtStart && insert2.length && before.merge(fromOff, before.length, insert2[0], false, openStart, 0)) {
          before.breakAfter = insert2.shift().breakAfter;
        } else if (fromOff < before.length || before.children.length && before.children[before.children.length - 1].length == 0) {
          before.merge(fromOff, before.length, null, false, openStart, 0);
        }
        fromI++;
      }
    }
    while (fromI < toI && insert2.length) {
      if (children[toI - 1].become(insert2[insert2.length - 1])) {
        toI--;
        insert2.pop();
        openEnd = insert2.length ? 0 : openStart;
      } else if (children[fromI].become(insert2[0])) {
        fromI++;
        insert2.shift();
        openStart = insert2.length ? 0 : openEnd;
      } else {
        break;
      }
    }
    if (!insert2.length && fromI && toI < children.length && !children[fromI - 1].breakAfter && children[toI].merge(0, 0, children[fromI - 1], false, openStart, openEnd))
      fromI--;
    if (fromI < toI || insert2.length)
      parent.replaceChildren(fromI, toI, insert2);
  }
  function mergeChildrenInto(parent, from, to, insert2, openStart, openEnd) {
    let cur2 = parent.childCursor();
    let {i: toI, off: toOff} = cur2.findPos(to, 1);
    let {i: fromI, off: fromOff} = cur2.findPos(from, -1);
    let dLen = from - to;
    for (let view of insert2)
      dLen += view.length;
    parent.length += dLen;
    replaceRange(parent, fromI, fromOff, toI, toOff, insert2, 0, openStart, openEnd);
  }
  var nav = typeof navigator != "undefined" ? navigator : {userAgent: "", vendor: "", platform: ""};
  var doc = typeof document != "undefined" ? document : {documentElement: {style: {}}};
  var ie_edge = /* @__PURE__ */ /Edge\/(\d+)/.exec(nav.userAgent);
  var ie_upto10 = /* @__PURE__ */ /MSIE \d/.test(nav.userAgent);
  var ie_11up = /* @__PURE__ */ /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(nav.userAgent);
  var ie2 = !!(ie_upto10 || ie_11up || ie_edge);
  var gecko2 = !ie2 && /* @__PURE__ */ /gecko\/(\d+)/i.test(nav.userAgent);
  var chrome2 = !ie2 && /* @__PURE__ */ /Chrome\/(\d+)/.exec(nav.userAgent);
  var webkit = "webkitFontSmoothing" in doc.documentElement.style;
  var safari = !ie2 && /* @__PURE__ */ /Apple Computer/.test(nav.vendor);
  var ios = safari && (/* @__PURE__ */ /Mobile\/\w+/.test(nav.userAgent) || nav.maxTouchPoints > 2);
  var browser = {
    mac: ios || /* @__PURE__ */ /Mac/.test(nav.platform),
    windows: /* @__PURE__ */ /Win/.test(nav.platform),
    linux: /* @__PURE__ */ /Linux|X11/.test(nav.platform),
    ie: ie2,
    ie_version: ie_upto10 ? doc.documentMode || 6 : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0,
    gecko: gecko2,
    gecko_version: gecko2 ? +(/* @__PURE__ */ /Firefox\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    chrome: !!chrome2,
    chrome_version: chrome2 ? +chrome2[1] : 0,
    ios,
    android: /* @__PURE__ */ /Android\b/.test(nav.userAgent),
    webkit,
    safari,
    webkit_version: webkit ? +(/* @__PURE__ */ /\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0,
    tabSize: doc.documentElement.style.tabSize != null ? "tab-size" : "-moz-tab-size"
  };
  var MaxJoinLen = 256;
  var TextView = class extends ContentView {
    constructor(text) {
      super();
      this.text = text;
    }
    get length() {
      return this.text.length;
    }
    createDOM(textDOM) {
      this.setDOM(textDOM || document.createTextNode(this.text));
    }
    sync(track) {
      if (!this.dom)
        this.createDOM();
      if (this.dom.nodeValue != this.text) {
        if (track && track.node == this.dom)
          track.written = true;
        this.dom.nodeValue = this.text;
      }
    }
    reuseDOM(dom) {
      if (dom.nodeType == 3)
        this.createDOM(dom);
    }
    merge(from, to, source) {
      if (source && (!(source instanceof TextView) || this.length - (to - from) + source.length > MaxJoinLen))
        return false;
      this.text = this.text.slice(0, from) + (source ? source.text : "") + this.text.slice(to);
      this.markDirty();
      return true;
    }
    split(from) {
      let result = new TextView(this.text.slice(from));
      this.text = this.text.slice(0, from);
      this.markDirty();
      return result;
    }
    localPosFromDOM(node, offset) {
      return node == this.dom ? offset : offset ? this.text.length : 0;
    }
    domAtPos(pos) {
      return new DOMPos(this.dom, pos);
    }
    domBoundsAround(_from, _to, offset) {
      return {from: offset, to: offset + this.length, startDOM: this.dom, endDOM: this.dom.nextSibling};
    }
    coordsAt(pos, side) {
      return textCoords(this.dom, pos, side);
    }
  };
  var MarkView = class extends ContentView {
    constructor(mark, children = [], length = 0) {
      super();
      this.mark = mark;
      this.children = children;
      this.length = length;
      for (let ch of children)
        ch.setParent(this);
    }
    setAttrs(dom) {
      clearAttributes(dom);
      if (this.mark.class)
        dom.className = this.mark.class;
      if (this.mark.attrs)
        for (let name2 in this.mark.attrs)
          dom.setAttribute(name2, this.mark.attrs[name2]);
      return dom;
    }
    reuseDOM(node) {
      if (node.nodeName == this.mark.tagName.toUpperCase()) {
        this.setDOM(node);
        this.dirty |= 4 | 2;
      }
    }
    sync(track) {
      if (!this.dom)
        this.setDOM(this.setAttrs(document.createElement(this.mark.tagName)));
      else if (this.dirty & 4)
        this.setAttrs(this.dom);
      super.sync(track);
    }
    merge(from, to, source, _hasStart, openStart, openEnd) {
      if (source && (!(source instanceof MarkView && source.mark.eq(this.mark)) || from && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      mergeChildrenInto(this, from, to, source ? source.children : [], openStart - 1, openEnd - 1);
      this.markDirty();
      return true;
    }
    split(from) {
      let result = [], off = 0, detachFrom = -1, i = 0;
      for (let elt2 of this.children) {
        let end = off + elt2.length;
        if (end > from)
          result.push(off < from ? elt2.split(from - off) : elt2);
        if (detachFrom < 0 && off >= from)
          detachFrom = i;
        off = end;
        i++;
      }
      let length = this.length - from;
      this.length = from;
      if (detachFrom > -1) {
        this.children.length = detachFrom;
        this.markDirty();
      }
      return new MarkView(this.mark, result, length);
    }
    domAtPos(pos) {
      return inlineDOMAtPos(this, pos);
    }
    coordsAt(pos, side) {
      return coordsInChildren(this, pos, side);
    }
  };
  function textCoords(text, pos, side) {
    let length = text.nodeValue.length;
    if (pos > length)
      pos = length;
    let from = pos, to = pos, flatten2 = 0;
    if (pos == 0 && side < 0 || pos == length && side >= 0) {
      if (!(browser.chrome || browser.gecko)) {
        if (pos) {
          from--;
          flatten2 = 1;
        } else if (to < length) {
          to++;
          flatten2 = -1;
        }
      }
    } else {
      if (side < 0)
        from--;
      else if (to < length)
        to++;
    }
    let rects = textRange(text, from, to).getClientRects();
    if (!rects.length)
      return Rect0;
    let rect = rects[(flatten2 ? flatten2 < 0 : side >= 0) ? 0 : rects.length - 1];
    if (browser.safari && !flatten2 && rect.width == 0)
      rect = Array.prototype.find.call(rects, (r) => r.width) || rect;
    return flatten2 ? flattenRect(rect, flatten2 < 0) : rect || null;
  }
  var WidgetView = class extends ContentView {
    constructor(widget, length, side) {
      super();
      this.widget = widget;
      this.length = length;
      this.side = side;
      this.prevWidget = null;
    }
    static create(widget, length, side) {
      return new (widget.customView || WidgetView)(widget, length, side);
    }
    split(from) {
      let result = WidgetView.create(this.widget, this.length - from, this.side);
      this.length -= from;
      return result;
    }
    sync() {
      if (!this.dom || !this.widget.updateDOM(this.dom)) {
        if (this.dom && this.prevWidget)
          this.prevWidget.destroy(this.dom);
        this.prevWidget = null;
        this.setDOM(this.widget.toDOM(this.editorView));
        this.dom.contentEditable = "false";
      }
    }
    getSide() {
      return this.side;
    }
    merge(from, to, source, hasStart, openStart, openEnd) {
      if (source && (!(source instanceof WidgetView) || !this.widget.compare(source.widget) || from > 0 && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      this.length = from + (source ? source.length : 0) + (this.length - to);
      return true;
    }
    become(other) {
      if (other.length == this.length && other instanceof WidgetView && other.side == this.side) {
        if (this.widget.constructor == other.widget.constructor) {
          if (!this.widget.eq(other.widget))
            this.markDirty(true);
          if (this.dom && !this.prevWidget)
            this.prevWidget = this.widget;
          this.widget = other.widget;
          return true;
        }
      }
      return false;
    }
    ignoreMutation() {
      return true;
    }
    ignoreEvent(event) {
      return this.widget.ignoreEvent(event);
    }
    get overrideDOMText() {
      if (this.length == 0)
        return Text.empty;
      let top2 = this;
      while (top2.parent)
        top2 = top2.parent;
      let view = top2.editorView, text = view && view.state.doc, start = this.posAtStart;
      return text ? text.slice(start, start + this.length) : Text.empty;
    }
    domAtPos(pos) {
      return pos == 0 ? DOMPos.before(this.dom) : DOMPos.after(this.dom, pos == this.length);
    }
    domBoundsAround() {
      return null;
    }
    coordsAt(pos, side) {
      let rects = this.dom.getClientRects(), rect = null;
      if (!rects.length)
        return Rect0;
      for (let i = pos > 0 ? rects.length - 1 : 0; ; i += pos > 0 ? -1 : 1) {
        rect = rects[i];
        if (pos > 0 ? i == 0 : i == rects.length - 1 || rect.top < rect.bottom)
          break;
      }
      return this.length ? rect : flattenRect(rect, this.side > 0);
    }
    get isEditable() {
      return false;
    }
    destroy() {
      super.destroy();
      if (this.dom)
        this.widget.destroy(this.dom);
    }
  };
  var CompositionView = class extends WidgetView {
    domAtPos(pos) {
      let {topView, text} = this.widget;
      if (!topView)
        return new DOMPos(text, Math.min(pos, text.nodeValue.length));
      return scanCompositionTree(pos, 0, topView, text, (v, p) => v.domAtPos(p), (p) => new DOMPos(text, Math.min(p, text.nodeValue.length)));
    }
    sync() {
      this.setDOM(this.widget.toDOM());
    }
    localPosFromDOM(node, offset) {
      let {topView, text} = this.widget;
      if (!topView)
        return Math.min(offset, this.length);
      return posFromDOMInCompositionTree(node, offset, topView, text);
    }
    ignoreMutation() {
      return false;
    }
    get overrideDOMText() {
      return null;
    }
    coordsAt(pos, side) {
      let {topView, text} = this.widget;
      if (!topView)
        return textCoords(text, pos, side);
      return scanCompositionTree(pos, side, topView, text, (v, pos2, side2) => v.coordsAt(pos2, side2), (pos2, side2) => textCoords(text, pos2, side2));
    }
    destroy() {
      var _a2;
      super.destroy();
      (_a2 = this.widget.topView) === null || _a2 === void 0 ? void 0 : _a2.destroy();
    }
    get isEditable() {
      return true;
    }
    canReuseDOM() {
      return true;
    }
  };
  function scanCompositionTree(pos, side, view, text, enterView, fromText) {
    if (view instanceof MarkView) {
      for (let child = view.dom.firstChild; child; child = child.nextSibling) {
        let desc = ContentView.get(child);
        if (!desc)
          return fromText(pos, side);
        let hasComp = contains(child, text);
        let len = desc.length + (hasComp ? text.nodeValue.length : 0);
        if (pos < len || pos == len && desc.getSide() <= 0)
          return hasComp ? scanCompositionTree(pos, side, desc, text, enterView, fromText) : enterView(desc, pos, side);
        pos -= len;
      }
      return enterView(view, view.length, -1);
    } else if (view.dom == text) {
      return fromText(pos, side);
    } else {
      return enterView(view, pos, side);
    }
  }
  function posFromDOMInCompositionTree(node, offset, view, text) {
    if (view instanceof MarkView) {
      for (let child of view.children) {
        let pos = 0, hasComp = contains(child.dom, text);
        if (contains(child.dom, node))
          return pos + (hasComp ? posFromDOMInCompositionTree(node, offset, child, text) : child.localPosFromDOM(node, offset));
        pos += hasComp ? text.nodeValue.length : child.length;
      }
    } else if (view.dom == text) {
      return Math.min(offset, text.nodeValue.length);
    }
    return view.localPosFromDOM(node, offset);
  }
  var WidgetBufferView = class extends ContentView {
    constructor(side) {
      super();
      this.side = side;
    }
    get length() {
      return 0;
    }
    merge() {
      return false;
    }
    become(other) {
      return other instanceof WidgetBufferView && other.side == this.side;
    }
    split() {
      return new WidgetBufferView(this.side);
    }
    sync() {
      if (!this.dom) {
        let dom = document.createElement("img");
        dom.className = "cm-widgetBuffer";
        dom.setAttribute("aria-hidden", "true");
        this.setDOM(dom);
      }
    }
    getSide() {
      return this.side;
    }
    domAtPos(pos) {
      return DOMPos.before(this.dom);
    }
    localPosFromDOM() {
      return 0;
    }
    domBoundsAround() {
      return null;
    }
    coordsAt(pos) {
      let imgRect = this.dom.getBoundingClientRect();
      let siblingRect = inlineSiblingRect(this, this.side > 0 ? -1 : 1);
      return siblingRect && siblingRect.top < imgRect.bottom && siblingRect.bottom > imgRect.top ? {left: imgRect.left, right: imgRect.right, top: siblingRect.top, bottom: siblingRect.bottom} : imgRect;
    }
    get overrideDOMText() {
      return Text.empty;
    }
  };
  TextView.prototype.children = WidgetView.prototype.children = WidgetBufferView.prototype.children = noChildren;
  function inlineSiblingRect(view, side) {
    let parent = view.parent, index = parent ? parent.children.indexOf(view) : -1;
    while (parent && index >= 0) {
      if (side < 0 ? index > 0 : index < parent.children.length) {
        let next = parent.children[index + side];
        if (next instanceof TextView) {
          let nextRect = next.coordsAt(side < 0 ? next.length : 0, side);
          if (nextRect)
            return nextRect;
        }
        index += side;
      } else if (parent instanceof MarkView && parent.parent) {
        index = parent.parent.children.indexOf(parent) + (side < 0 ? 0 : 1);
        parent = parent.parent;
      } else {
        let last = parent.dom.lastChild;
        if (last && last.nodeName == "BR")
          return last.getClientRects()[0];
        break;
      }
    }
    return void 0;
  }
  function inlineDOMAtPos(parent, pos) {
    let dom = parent.dom, {children} = parent, i = 0;
    for (let off = 0; i < children.length; i++) {
      let child = children[i], end = off + child.length;
      if (end == off && child.getSide() <= 0)
        continue;
      if (pos > off && pos < end && child.dom.parentNode == dom)
        return child.domAtPos(pos - off);
      if (pos <= off)
        break;
      off = end;
    }
    for (let j = i; j > 0; j--) {
      let prev = children[j - 1];
      if (prev.dom.parentNode == dom)
        return prev.domAtPos(prev.length);
    }
    for (let j = i; j < children.length; j++) {
      let next = children[j];
      if (next.dom.parentNode == dom)
        return next.domAtPos(0);
    }
    return new DOMPos(dom, 0);
  }
  function joinInlineInto(parent, view, open) {
    let last, {children} = parent;
    if (open > 0 && view instanceof MarkView && children.length && (last = children[children.length - 1]) instanceof MarkView && last.mark.eq(view.mark)) {
      joinInlineInto(last, view.children[0], open - 1);
    } else {
      children.push(view);
      view.setParent(parent);
    }
    parent.length += view.length;
  }
  function coordsInChildren(view, pos, side) {
    let before = null, beforePos = -1, after = null, afterPos = -1;
    function scan(view2, pos2) {
      for (let i = 0, off = 0; i < view2.children.length && off <= pos2; i++) {
        let child = view2.children[i], end = off + child.length;
        if (end >= pos2) {
          if (child.children.length) {
            scan(child, pos2 - off);
          } else if (!after && (end > pos2 || off == end && child.getSide() > 0)) {
            after = child;
            afterPos = pos2 - off;
          } else if (off < pos2 || off == end && child.getSide() < 0) {
            before = child;
            beforePos = pos2 - off;
          }
        }
        off = end;
      }
    }
    scan(view, pos);
    let target = (side < 0 ? before : after) || before || after;
    if (target)
      return target.coordsAt(Math.max(0, target == before ? beforePos : afterPos), side);
    return fallbackRect(view);
  }
  function fallbackRect(view) {
    let last = view.dom.lastChild;
    if (!last)
      return view.dom.getBoundingClientRect();
    let rects = clientRectsFor(last);
    return rects[rects.length - 1] || null;
  }
  function combineAttrs(source, target) {
    for (let name2 in source) {
      if (name2 == "class" && target.class)
        target.class += " " + source.class;
      else if (name2 == "style" && target.style)
        target.style += ";" + source.style;
      else
        target[name2] = source[name2];
    }
    return target;
  }
  function attrsEq(a, b) {
    if (a == b)
      return true;
    if (!a || !b)
      return false;
    let keysA = Object.keys(a), keysB = Object.keys(b);
    if (keysA.length != keysB.length)
      return false;
    for (let key of keysA) {
      if (keysB.indexOf(key) == -1 || a[key] !== b[key])
        return false;
    }
    return true;
  }
  function updateAttrs(dom, prev, attrs) {
    let changed = null;
    if (prev) {
      for (let name2 in prev)
        if (!(attrs && name2 in attrs))
          dom.removeAttribute(changed = name2);
    }
    if (attrs) {
      for (let name2 in attrs)
        if (!(prev && prev[name2] == attrs[name2]))
          dom.setAttribute(changed = name2, attrs[name2]);
    }
    return !!changed;
  }
  var WidgetType = class {
    eq(widget) {
      return false;
    }
    updateDOM(dom) {
      return false;
    }
    compare(other) {
      return this == other || this.constructor == other.constructor && this.eq(other);
    }
    get estimatedHeight() {
      return -1;
    }
    ignoreEvent(event) {
      return true;
    }
    get customView() {
      return null;
    }
    destroy(dom) {
    }
  };
  var BlockType = /* @__PURE__ */ function(BlockType2) {
    BlockType2[BlockType2["Text"] = 0] = "Text";
    BlockType2[BlockType2["WidgetBefore"] = 1] = "WidgetBefore";
    BlockType2[BlockType2["WidgetAfter"] = 2] = "WidgetAfter";
    BlockType2[BlockType2["WidgetRange"] = 3] = "WidgetRange";
    return BlockType2;
  }(BlockType || (BlockType = {}));
  var Decoration = class extends RangeValue {
    constructor(startSide, endSide, widget, spec) {
      super();
      this.startSide = startSide;
      this.endSide = endSide;
      this.widget = widget;
      this.spec = spec;
    }
    get heightRelevant() {
      return false;
    }
    static mark(spec) {
      return new MarkDecoration(spec);
    }
    static widget(spec) {
      let side = spec.side || 0, block = !!spec.block;
      side += block ? side > 0 ? 3e8 : -4e8 : side > 0 ? 1e8 : -1e8;
      return new PointDecoration(spec, side, side, block, spec.widget || null, false);
    }
    static replace(spec) {
      let block = !!spec.block, startSide, endSide;
      if (spec.isBlockGap) {
        startSide = -5e8;
        endSide = 4e8;
      } else {
        let {start, end} = getInclusive(spec, block);
        startSide = (start ? block ? -3e8 : -1 : 5e8) - 1;
        endSide = (end ? block ? 2e8 : 1 : -6e8) + 1;
      }
      return new PointDecoration(spec, startSide, endSide, block, spec.widget || null, true);
    }
    static line(spec) {
      return new LineDecoration(spec);
    }
    static set(of, sort = false) {
      return RangeSet.of(of, sort);
    }
    hasHeight() {
      return this.widget ? this.widget.estimatedHeight > -1 : false;
    }
  };
  Decoration.none = RangeSet.empty;
  var MarkDecoration = class extends Decoration {
    constructor(spec) {
      let {start, end} = getInclusive(spec);
      super(start ? -1 : 5e8, end ? 1 : -6e8, null, spec);
      this.tagName = spec.tagName || "span";
      this.class = spec.class || "";
      this.attrs = spec.attributes || null;
    }
    eq(other) {
      return this == other || other instanceof MarkDecoration && this.tagName == other.tagName && this.class == other.class && attrsEq(this.attrs, other.attrs);
    }
    range(from, to = from) {
      if (from >= to)
        throw new RangeError("Mark decorations may not be empty");
      return super.range(from, to);
    }
  };
  MarkDecoration.prototype.point = false;
  var LineDecoration = class extends Decoration {
    constructor(spec) {
      super(-2e8, -2e8, null, spec);
    }
    eq(other) {
      return other instanceof LineDecoration && attrsEq(this.spec.attributes, other.spec.attributes);
    }
    range(from, to = from) {
      if (to != from)
        throw new RangeError("Line decoration ranges must be zero-length");
      return super.range(from, to);
    }
  };
  LineDecoration.prototype.mapMode = MapMode.TrackBefore;
  LineDecoration.prototype.point = true;
  var PointDecoration = class extends Decoration {
    constructor(spec, startSide, endSide, block, widget, isReplace) {
      super(startSide, endSide, widget, spec);
      this.block = block;
      this.isReplace = isReplace;
      this.mapMode = !block ? MapMode.TrackDel : startSide <= 0 ? MapMode.TrackBefore : MapMode.TrackAfter;
    }
    get type() {
      return this.startSide < this.endSide ? BlockType.WidgetRange : this.startSide <= 0 ? BlockType.WidgetBefore : BlockType.WidgetAfter;
    }
    get heightRelevant() {
      return this.block || !!this.widget && this.widget.estimatedHeight >= 5;
    }
    eq(other) {
      return other instanceof PointDecoration && widgetsEq(this.widget, other.widget) && this.block == other.block && this.startSide == other.startSide && this.endSide == other.endSide;
    }
    range(from, to = from) {
      if (this.isReplace && (from > to || from == to && this.startSide > 0 && this.endSide <= 0))
        throw new RangeError("Invalid range for replacement decoration");
      if (!this.isReplace && to != from)
        throw new RangeError("Widget decorations can only have zero-length ranges");
      return super.range(from, to);
    }
  };
  PointDecoration.prototype.point = true;
  function getInclusive(spec, block = false) {
    let {inclusiveStart: start, inclusiveEnd: end} = spec;
    if (start == null)
      start = spec.inclusive;
    if (end == null)
      end = spec.inclusive;
    return {start: start !== null && start !== void 0 ? start : block, end: end !== null && end !== void 0 ? end : block};
  }
  function widgetsEq(a, b) {
    return a == b || !!(a && b && a.compare(b));
  }
  function addRange(from, to, ranges, margin = 0) {
    let last = ranges.length - 1;
    if (last >= 0 && ranges[last] + margin >= from)
      ranges[last] = Math.max(ranges[last], to);
    else
      ranges.push(from, to);
  }
  var LineView = class extends ContentView {
    constructor() {
      super(...arguments);
      this.children = [];
      this.length = 0;
      this.prevAttrs = void 0;
      this.attrs = null;
      this.breakAfter = 0;
    }
    merge(from, to, source, hasStart, openStart, openEnd) {
      if (source) {
        if (!(source instanceof LineView))
          return false;
        if (!this.dom)
          source.transferDOM(this);
      }
      if (hasStart)
        this.setDeco(source ? source.attrs : null);
      mergeChildrenInto(this, from, to, source ? source.children : [], openStart, openEnd);
      return true;
    }
    split(at) {
      let end = new LineView();
      end.breakAfter = this.breakAfter;
      if (this.length == 0)
        return end;
      let {i, off} = this.childPos(at);
      if (off) {
        end.append(this.children[i].split(off), 0);
        this.children[i].merge(off, this.children[i].length, null, false, 0, 0);
        i++;
      }
      for (let j = i; j < this.children.length; j++)
        end.append(this.children[j], 0);
      while (i > 0 && this.children[i - 1].length == 0)
        this.children[--i].destroy();
      this.children.length = i;
      this.markDirty();
      this.length = at;
      return end;
    }
    transferDOM(other) {
      if (!this.dom)
        return;
      this.markDirty();
      other.setDOM(this.dom);
      other.prevAttrs = this.prevAttrs === void 0 ? this.attrs : this.prevAttrs;
      this.prevAttrs = void 0;
      this.dom = null;
    }
    setDeco(attrs) {
      if (!attrsEq(this.attrs, attrs)) {
        if (this.dom) {
          this.prevAttrs = this.attrs;
          this.markDirty();
        }
        this.attrs = attrs;
      }
    }
    append(child, openStart) {
      joinInlineInto(this, child, openStart);
    }
    addLineDeco(deco) {
      let attrs = deco.spec.attributes, cls = deco.spec.class;
      if (attrs)
        this.attrs = combineAttrs(attrs, this.attrs || {});
      if (cls)
        this.attrs = combineAttrs({class: cls}, this.attrs || {});
    }
    domAtPos(pos) {
      return inlineDOMAtPos(this, pos);
    }
    reuseDOM(node) {
      if (node.nodeName == "DIV") {
        this.setDOM(node);
        this.dirty |= 4 | 2;
      }
    }
    sync(track) {
      var _a2;
      if (!this.dom) {
        this.setDOM(document.createElement("div"));
        this.dom.className = "cm-line";
        this.prevAttrs = this.attrs ? null : void 0;
      } else if (this.dirty & 4) {
        clearAttributes(this.dom);
        this.dom.className = "cm-line";
        this.prevAttrs = this.attrs ? null : void 0;
      }
      if (this.prevAttrs !== void 0) {
        updateAttrs(this.dom, this.prevAttrs, this.attrs);
        this.dom.classList.add("cm-line");
        this.prevAttrs = void 0;
      }
      super.sync(track);
      let last = this.dom.lastChild;
      while (last && ContentView.get(last) instanceof MarkView)
        last = last.lastChild;
      if (!last || !this.length || last.nodeName != "BR" && ((_a2 = ContentView.get(last)) === null || _a2 === void 0 ? void 0 : _a2.isEditable) == false && (!browser.ios || !this.children.some((ch) => ch instanceof TextView))) {
        let hack = document.createElement("BR");
        hack.cmIgnore = true;
        this.dom.appendChild(hack);
      }
    }
    measureTextSize() {
      if (this.children.length == 0 || this.length > 20)
        return null;
      let totalWidth = 0;
      for (let child of this.children) {
        if (!(child instanceof TextView) || /[^ -~]/.test(child.text))
          return null;
        let rects = clientRectsFor(child.dom);
        if (rects.length != 1)
          return null;
        totalWidth += rects[0].width;
      }
      return !totalWidth ? null : {
        lineHeight: this.dom.getBoundingClientRect().height,
        charWidth: totalWidth / this.length
      };
    }
    coordsAt(pos, side) {
      return coordsInChildren(this, pos, side);
    }
    become(_other) {
      return false;
    }
    get type() {
      return BlockType.Text;
    }
    static find(docView, pos) {
      for (let i = 0, off = 0; i < docView.children.length; i++) {
        let block = docView.children[i], end = off + block.length;
        if (end >= pos) {
          if (block instanceof LineView)
            return block;
          if (end > pos)
            break;
        }
        off = end + block.breakAfter;
      }
      return null;
    }
  };
  var BlockWidgetView = class extends ContentView {
    constructor(widget, length, type) {
      super();
      this.widget = widget;
      this.length = length;
      this.type = type;
      this.breakAfter = 0;
      this.prevWidget = null;
    }
    merge(from, to, source, _takeDeco, openStart, openEnd) {
      if (source && (!(source instanceof BlockWidgetView) || !this.widget.compare(source.widget) || from > 0 && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      this.length = from + (source ? source.length : 0) + (this.length - to);
      return true;
    }
    domAtPos(pos) {
      return pos == 0 ? DOMPos.before(this.dom) : DOMPos.after(this.dom, pos == this.length);
    }
    split(at) {
      let len = this.length - at;
      this.length = at;
      let end = new BlockWidgetView(this.widget, len, this.type);
      end.breakAfter = this.breakAfter;
      return end;
    }
    get children() {
      return noChildren;
    }
    sync() {
      if (!this.dom || !this.widget.updateDOM(this.dom)) {
        if (this.dom && this.prevWidget)
          this.prevWidget.destroy(this.dom);
        this.prevWidget = null;
        this.setDOM(this.widget.toDOM(this.editorView));
        this.dom.contentEditable = "false";
      }
    }
    get overrideDOMText() {
      return this.parent ? this.parent.view.state.doc.slice(this.posAtStart, this.posAtEnd) : Text.empty;
    }
    domBoundsAround() {
      return null;
    }
    become(other) {
      if (other instanceof BlockWidgetView && other.type == this.type && other.widget.constructor == this.widget.constructor) {
        if (!other.widget.eq(this.widget))
          this.markDirty(true);
        if (this.dom && !this.prevWidget)
          this.prevWidget = this.widget;
        this.widget = other.widget;
        this.length = other.length;
        this.breakAfter = other.breakAfter;
        return true;
      }
      return false;
    }
    ignoreMutation() {
      return true;
    }
    ignoreEvent(event) {
      return this.widget.ignoreEvent(event);
    }
    destroy() {
      super.destroy();
      if (this.dom)
        this.widget.destroy(this.dom);
    }
  };
  var ContentBuilder = class {
    constructor(doc2, pos, end, disallowBlockEffectsFor) {
      this.doc = doc2;
      this.pos = pos;
      this.end = end;
      this.disallowBlockEffectsFor = disallowBlockEffectsFor;
      this.content = [];
      this.curLine = null;
      this.breakAtStart = 0;
      this.pendingBuffer = 0;
      this.atCursorPos = true;
      this.openStart = -1;
      this.openEnd = -1;
      this.text = "";
      this.textOff = 0;
      this.cursor = doc2.iter();
      this.skip = pos;
    }
    posCovered() {
      if (this.content.length == 0)
        return !this.breakAtStart && this.doc.lineAt(this.pos).from != this.pos;
      let last = this.content[this.content.length - 1];
      return !last.breakAfter && !(last instanceof BlockWidgetView && last.type == BlockType.WidgetBefore);
    }
    getLine() {
      if (!this.curLine) {
        this.content.push(this.curLine = new LineView());
        this.atCursorPos = true;
      }
      return this.curLine;
    }
    flushBuffer(active) {
      if (this.pendingBuffer) {
        this.curLine.append(wrapMarks(new WidgetBufferView(-1), active), active.length);
        this.pendingBuffer = 0;
      }
    }
    addBlockWidget(view) {
      this.flushBuffer([]);
      this.curLine = null;
      this.content.push(view);
    }
    finish(openEnd) {
      if (!openEnd)
        this.flushBuffer([]);
      else
        this.pendingBuffer = 0;
      if (!this.posCovered())
        this.getLine();
    }
    buildText(length, active, openStart) {
      while (length > 0) {
        if (this.textOff == this.text.length) {
          let {value, lineBreak, done} = this.cursor.next(this.skip);
          this.skip = 0;
          if (done)
            throw new Error("Ran out of text content when drawing inline views");
          if (lineBreak) {
            if (!this.posCovered())
              this.getLine();
            if (this.content.length)
              this.content[this.content.length - 1].breakAfter = 1;
            else
              this.breakAtStart = 1;
            this.flushBuffer([]);
            this.curLine = null;
            length--;
            continue;
          } else {
            this.text = value;
            this.textOff = 0;
          }
        }
        let take = Math.min(this.text.length - this.textOff, length, 512);
        this.flushBuffer(active.slice(0, openStart));
        this.getLine().append(wrapMarks(new TextView(this.text.slice(this.textOff, this.textOff + take)), active), openStart);
        this.atCursorPos = true;
        this.textOff += take;
        length -= take;
        openStart = 0;
      }
    }
    span(from, to, active, openStart) {
      this.buildText(to - from, active, openStart);
      this.pos = to;
      if (this.openStart < 0)
        this.openStart = openStart;
    }
    point(from, to, deco, active, openStart, index) {
      if (this.disallowBlockEffectsFor[index] && deco instanceof PointDecoration) {
        if (deco.block)
          throw new RangeError("Block decorations may not be specified via plugins");
        if (to > this.doc.lineAt(this.pos).to)
          throw new RangeError("Decorations that replace line breaks may not be specified via plugins");
      }
      let len = to - from;
      if (deco instanceof PointDecoration) {
        if (deco.block) {
          let {type} = deco;
          if (type == BlockType.WidgetAfter && !this.posCovered())
            this.getLine();
          this.addBlockWidget(new BlockWidgetView(deco.widget || new NullWidget("div"), len, type));
        } else {
          let view = WidgetView.create(deco.widget || new NullWidget("span"), len, len ? 0 : deco.startSide);
          let cursorBefore = this.atCursorPos && !view.isEditable && openStart <= active.length && (from < to || deco.startSide > 0);
          let cursorAfter = !view.isEditable && (from < to || deco.startSide <= 0);
          let line = this.getLine();
          if (this.pendingBuffer == 2 && !cursorBefore)
            this.pendingBuffer = 0;
          this.flushBuffer(active);
          if (cursorBefore) {
            line.append(wrapMarks(new WidgetBufferView(1), active), openStart);
            openStart = active.length + Math.max(0, openStart - active.length);
          }
          line.append(wrapMarks(view, active), openStart);
          this.atCursorPos = cursorAfter;
          this.pendingBuffer = !cursorAfter ? 0 : from < to ? 1 : 2;
        }
      } else if (this.doc.lineAt(this.pos).from == this.pos) {
        this.getLine().addLineDeco(deco);
      }
      if (len) {
        if (this.textOff + len <= this.text.length) {
          this.textOff += len;
        } else {
          this.skip += len - (this.text.length - this.textOff);
          this.text = "";
          this.textOff = 0;
        }
        this.pos = to;
      }
      if (this.openStart < 0)
        this.openStart = openStart;
    }
    static build(text, from, to, decorations2, dynamicDecorationMap) {
      let builder = new ContentBuilder(text, from, to, dynamicDecorationMap);
      builder.openEnd = RangeSet.spans(decorations2, from, to, builder);
      if (builder.openStart < 0)
        builder.openStart = builder.openEnd;
      builder.finish(builder.openEnd);
      return builder;
    }
  };
  function wrapMarks(view, active) {
    for (let mark of active)
      view = new MarkView(mark, [view], view.length);
    return view;
  }
  var NullWidget = class extends WidgetType {
    constructor(tag) {
      super();
      this.tag = tag;
    }
    eq(other) {
      return other.tag == this.tag;
    }
    toDOM() {
      return document.createElement(this.tag);
    }
    updateDOM(elt2) {
      return elt2.nodeName.toLowerCase() == this.tag;
    }
  };
  var clickAddsSelectionRange = /* @__PURE__ */ Facet.define();
  var dragMovesSelection$1 = /* @__PURE__ */ Facet.define();
  var mouseSelectionStyle = /* @__PURE__ */ Facet.define();
  var exceptionSink = /* @__PURE__ */ Facet.define();
  var updateListener = /* @__PURE__ */ Facet.define();
  var inputHandler = /* @__PURE__ */ Facet.define();
  var perLineTextDirection = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.some((x) => x)
  });
  var nativeSelectionHidden = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.some((x) => x)
  });
  var ScrollTarget = class {
    constructor(range, y = "nearest", x = "nearest", yMargin = 5, xMargin = 5) {
      this.range = range;
      this.y = y;
      this.x = x;
      this.yMargin = yMargin;
      this.xMargin = xMargin;
    }
    map(changes) {
      return changes.empty ? this : new ScrollTarget(this.range.map(changes), this.y, this.x, this.yMargin, this.xMargin);
    }
  };
  var scrollIntoView = /* @__PURE__ */ StateEffect.define({map: (t2, ch) => t2.map(ch)});
  function logException(state, exception, context) {
    let handler = state.facet(exceptionSink);
    if (handler.length)
      handler[0](exception);
    else if (window.onerror)
      window.onerror(String(exception), context, void 0, void 0, exception);
    else if (context)
      console.error(context + ":", exception);
    else
      console.error(exception);
  }
  var editable = /* @__PURE__ */ Facet.define({combine: (values2) => values2.length ? values2[0] : true});
  var nextPluginID = 0;
  var viewPlugin = /* @__PURE__ */ Facet.define();
  var ViewPlugin = class {
    constructor(id2, create, domEventHandlers, buildExtensions) {
      this.id = id2;
      this.create = create;
      this.domEventHandlers = domEventHandlers;
      this.extension = buildExtensions(this);
    }
    static define(create, spec) {
      const {eventHandlers, provide, decorations: deco} = spec || {};
      return new ViewPlugin(nextPluginID++, create, eventHandlers, (plugin) => {
        let ext = [viewPlugin.of(plugin)];
        if (deco)
          ext.push(decorations.of((view) => {
            let pluginInst = view.plugin(plugin);
            return pluginInst ? deco(pluginInst) : Decoration.none;
          }));
        if (provide)
          ext.push(provide(plugin));
        return ext;
      });
    }
    static fromClass(cls, spec) {
      return ViewPlugin.define((view) => new cls(view), spec);
    }
  };
  var PluginInstance = class {
    constructor(spec) {
      this.spec = spec;
      this.mustUpdate = null;
      this.value = null;
    }
    update(view) {
      if (!this.value) {
        if (this.spec) {
          try {
            this.value = this.spec.create(view);
          } catch (e) {
            logException(view.state, e, "CodeMirror plugin crashed");
            this.deactivate();
          }
        }
      } else if (this.mustUpdate) {
        let update = this.mustUpdate;
        this.mustUpdate = null;
        if (this.value.update) {
          try {
            this.value.update(update);
          } catch (e) {
            logException(update.state, e, "CodeMirror plugin crashed");
            if (this.value.destroy)
              try {
                this.value.destroy();
              } catch (_) {
              }
            this.deactivate();
          }
        }
      }
      return this;
    }
    destroy(view) {
      var _a2;
      if ((_a2 = this.value) === null || _a2 === void 0 ? void 0 : _a2.destroy) {
        try {
          this.value.destroy();
        } catch (e) {
          logException(view.state, e, "CodeMirror plugin crashed");
        }
      }
    }
    deactivate() {
      this.spec = this.value = null;
    }
  };
  var editorAttributes = /* @__PURE__ */ Facet.define();
  var contentAttributes = /* @__PURE__ */ Facet.define();
  var decorations = /* @__PURE__ */ Facet.define();
  var atomicRanges = /* @__PURE__ */ Facet.define();
  var scrollMargins = /* @__PURE__ */ Facet.define();
  var styleModule = /* @__PURE__ */ Facet.define();
  var ChangedRange = class {
    constructor(fromA, toA, fromB, toB) {
      this.fromA = fromA;
      this.toA = toA;
      this.fromB = fromB;
      this.toB = toB;
    }
    join(other) {
      return new ChangedRange(Math.min(this.fromA, other.fromA), Math.max(this.toA, other.toA), Math.min(this.fromB, other.fromB), Math.max(this.toB, other.toB));
    }
    addToSet(set) {
      let i = set.length, me = this;
      for (; i > 0; i--) {
        let range = set[i - 1];
        if (range.fromA > me.toA)
          continue;
        if (range.toA < me.fromA)
          break;
        me = me.join(range);
        set.splice(i - 1, 1);
      }
      set.splice(i, 0, me);
      return set;
    }
    static extendWithRanges(diff, ranges) {
      if (ranges.length == 0)
        return diff;
      let result = [];
      for (let dI = 0, rI = 0, posA = 0, posB = 0; ; dI++) {
        let next = dI == diff.length ? null : diff[dI], off = posA - posB;
        let end = next ? next.fromB : 1e9;
        while (rI < ranges.length && ranges[rI] < end) {
          let from = ranges[rI], to = ranges[rI + 1];
          let fromB = Math.max(posB, from), toB = Math.min(end, to);
          if (fromB <= toB)
            new ChangedRange(fromB + off, toB + off, fromB, toB).addToSet(result);
          if (to > end)
            break;
          else
            rI += 2;
        }
        if (!next)
          return result;
        new ChangedRange(next.fromA, next.toA, next.fromB, next.toB).addToSet(result);
        posA = next.toA;
        posB = next.toB;
      }
    }
  };
  var ViewUpdate = class {
    constructor(view, state, transactions) {
      this.view = view;
      this.state = state;
      this.transactions = transactions;
      this.flags = 0;
      this.startState = view.state;
      this.changes = ChangeSet.empty(this.startState.doc.length);
      for (let tr of transactions)
        this.changes = this.changes.compose(tr.changes);
      let changedRanges = [];
      this.changes.iterChangedRanges((fromA, toA, fromB, toB) => changedRanges.push(new ChangedRange(fromA, toA, fromB, toB)));
      this.changedRanges = changedRanges;
      let focus = view.hasFocus;
      if (focus != view.inputState.notifiedFocused) {
        view.inputState.notifiedFocused = focus;
        this.flags |= 1;
      }
    }
    static create(view, state, transactions) {
      return new ViewUpdate(view, state, transactions);
    }
    get viewportChanged() {
      return (this.flags & 4) > 0;
    }
    get heightChanged() {
      return (this.flags & 2) > 0;
    }
    get geometryChanged() {
      return this.docChanged || (this.flags & (8 | 2)) > 0;
    }
    get focusChanged() {
      return (this.flags & 1) > 0;
    }
    get docChanged() {
      return !this.changes.empty;
    }
    get selectionSet() {
      return this.transactions.some((tr) => tr.selection);
    }
    get empty() {
      return this.flags == 0 && this.transactions.length == 0;
    }
  };
  var Direction = /* @__PURE__ */ function(Direction2) {
    Direction2[Direction2["LTR"] = 0] = "LTR";
    Direction2[Direction2["RTL"] = 1] = "RTL";
    return Direction2;
  }(Direction || (Direction = {}));
  var LTR = Direction.LTR;
  var RTL = Direction.RTL;
  function dec(str) {
    let result = [];
    for (let i = 0; i < str.length; i++)
      result.push(1 << +str[i]);
    return result;
  }
  var LowTypes = /* @__PURE__ */ dec("88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008");
  var ArabicTypes = /* @__PURE__ */ dec("4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333");
  var Brackets = /* @__PURE__ */ Object.create(null);
  var BracketStack = [];
  for (let p of ["()", "[]", "{}"]) {
    let l = /* @__PURE__ */ p.charCodeAt(0), r = /* @__PURE__ */ p.charCodeAt(1);
    Brackets[l] = r;
    Brackets[r] = -l;
  }
  function charType(ch) {
    return ch <= 247 ? LowTypes[ch] : 1424 <= ch && ch <= 1524 ? 2 : 1536 <= ch && ch <= 1785 ? ArabicTypes[ch - 1536] : 1774 <= ch && ch <= 2220 ? 4 : 8192 <= ch && ch <= 8203 ? 256 : 64336 <= ch && ch <= 65023 ? 4 : ch == 8204 ? 256 : 1;
  }
  var BidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff]/;
  var BidiSpan = class {
    constructor(from, to, level) {
      this.from = from;
      this.to = to;
      this.level = level;
    }
    get dir() {
      return this.level % 2 ? RTL : LTR;
    }
    side(end, dir) {
      return this.dir == dir == end ? this.to : this.from;
    }
    static find(order, index, level, assoc) {
      let maybe = -1;
      for (let i = 0; i < order.length; i++) {
        let span = order[i];
        if (span.from <= index && span.to >= index) {
          if (span.level == level)
            return i;
          if (maybe < 0 || (assoc != 0 ? assoc < 0 ? span.from < index : span.to > index : order[maybe].level > span.level))
            maybe = i;
        }
      }
      if (maybe < 0)
        throw new RangeError("Index out of range");
      return maybe;
    }
  };
  var types = [];
  function computeOrder(line, direction) {
    let len = line.length, outerType = direction == LTR ? 1 : 2, oppositeType = direction == LTR ? 2 : 1;
    if (!line || outerType == 1 && !BidiRE.test(line))
      return trivialOrder(len);
    for (let i = 0, prev = outerType, prevStrong = outerType; i < len; i++) {
      let type = charType(line.charCodeAt(i));
      if (type == 512)
        type = prev;
      else if (type == 8 && prevStrong == 4)
        type = 16;
      types[i] = type == 4 ? 2 : type;
      if (type & 7)
        prevStrong = type;
      prev = type;
    }
    for (let i = 0, prev = outerType, prevStrong = outerType; i < len; i++) {
      let type = types[i];
      if (type == 128) {
        if (i < len - 1 && prev == types[i + 1] && prev & 24)
          type = types[i] = prev;
        else
          types[i] = 256;
      } else if (type == 64) {
        let end = i + 1;
        while (end < len && types[end] == 64)
          end++;
        let replace = i && prev == 8 || end < len && types[end] == 8 ? prevStrong == 1 ? 1 : 8 : 256;
        for (let j = i; j < end; j++)
          types[j] = replace;
        i = end - 1;
      } else if (type == 8 && prevStrong == 1) {
        types[i] = 1;
      }
      prev = type;
      if (type & 7)
        prevStrong = type;
    }
    for (let i = 0, sI = 0, context = 0, ch, br, type; i < len; i++) {
      if (br = Brackets[ch = line.charCodeAt(i)]) {
        if (br < 0) {
          for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
            if (BracketStack[sJ + 1] == -br) {
              let flags = BracketStack[sJ + 2];
              let type2 = flags & 2 ? outerType : !(flags & 4) ? 0 : flags & 1 ? oppositeType : outerType;
              if (type2)
                types[i] = types[BracketStack[sJ]] = type2;
              sI = sJ;
              break;
            }
          }
        } else if (BracketStack.length == 189) {
          break;
        } else {
          BracketStack[sI++] = i;
          BracketStack[sI++] = ch;
          BracketStack[sI++] = context;
        }
      } else if ((type = types[i]) == 2 || type == 1) {
        let embed = type == outerType;
        context = embed ? 0 : 1;
        for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
          let cur2 = BracketStack[sJ + 2];
          if (cur2 & 2)
            break;
          if (embed) {
            BracketStack[sJ + 2] |= 2;
          } else {
            if (cur2 & 4)
              break;
            BracketStack[sJ + 2] |= 4;
          }
        }
      }
    }
    for (let i = 0; i < len; i++) {
      if (types[i] == 256) {
        let end = i + 1;
        while (end < len && types[end] == 256)
          end++;
        let beforeL = (i ? types[i - 1] : outerType) == 1;
        let afterL = (end < len ? types[end] : outerType) == 1;
        let replace = beforeL == afterL ? beforeL ? 1 : 2 : outerType;
        for (let j = i; j < end; j++)
          types[j] = replace;
        i = end - 1;
      }
    }
    let order = [];
    if (outerType == 1) {
      for (let i = 0; i < len; ) {
        let start = i, rtl = types[i++] != 1;
        while (i < len && rtl == (types[i] != 1))
          i++;
        if (rtl) {
          for (let j = i; j > start; ) {
            let end = j, l = types[--j] != 2;
            while (j > start && l == (types[j - 1] != 2))
              j--;
            order.push(new BidiSpan(j, end, l ? 2 : 1));
          }
        } else {
          order.push(new BidiSpan(start, i, 0));
        }
      }
    } else {
      for (let i = 0; i < len; ) {
        let start = i, rtl = types[i++] == 2;
        while (i < len && rtl == (types[i] == 2))
          i++;
        order.push(new BidiSpan(start, i, rtl ? 1 : 2));
      }
    }
    return order;
  }
  function trivialOrder(length) {
    return [new BidiSpan(0, length, 0)];
  }
  var movedOver = "";
  function moveVisually(line, order, dir, start, forward) {
    var _a2;
    let startIndex = start.head - line.from, spanI = -1;
    if (startIndex == 0) {
      if (!forward || !line.length)
        return null;
      if (order[0].level != dir) {
        startIndex = order[0].side(false, dir);
        spanI = 0;
      }
    } else if (startIndex == line.length) {
      if (forward)
        return null;
      let last = order[order.length - 1];
      if (last.level != dir) {
        startIndex = last.side(true, dir);
        spanI = order.length - 1;
      }
    }
    if (spanI < 0)
      spanI = BidiSpan.find(order, startIndex, (_a2 = start.bidiLevel) !== null && _a2 !== void 0 ? _a2 : -1, start.assoc);
    let span = order[spanI];
    if (startIndex == span.side(forward, dir)) {
      span = order[spanI += forward ? 1 : -1];
      startIndex = span.side(!forward, dir);
    }
    let indexForward = forward == (span.dir == dir);
    let nextIndex = findClusterBreak(line.text, startIndex, indexForward);
    movedOver = line.text.slice(Math.min(startIndex, nextIndex), Math.max(startIndex, nextIndex));
    if (nextIndex != span.side(forward, dir))
      return EditorSelection.cursor(nextIndex + line.from, indexForward ? -1 : 1, span.level);
    let nextSpan = spanI == (forward ? order.length - 1 : 0) ? null : order[spanI + (forward ? 1 : -1)];
    if (!nextSpan && span.level != dir)
      return EditorSelection.cursor(forward ? line.to : line.from, forward ? -1 : 1, dir);
    if (nextSpan && nextSpan.level < span.level)
      return EditorSelection.cursor(nextSpan.side(!forward, dir) + line.from, forward ? 1 : -1, nextSpan.level);
    return EditorSelection.cursor(nextIndex + line.from, forward ? -1 : 1, span.level);
  }
  var LineBreakPlaceholder = "\uFFFF";
  var DOMReader = class {
    constructor(points, state) {
      this.points = points;
      this.text = "";
      this.lineSeparator = state.facet(EditorState.lineSeparator);
    }
    append(text) {
      this.text += text;
    }
    lineBreak() {
      this.text += LineBreakPlaceholder;
    }
    readRange(start, end) {
      if (!start)
        return this;
      let parent = start.parentNode;
      for (let cur2 = start; ; ) {
        this.findPointBefore(parent, cur2);
        this.readNode(cur2);
        let next = cur2.nextSibling;
        if (next == end)
          break;
        let view = ContentView.get(cur2), nextView = ContentView.get(next);
        if (view && nextView ? view.breakAfter : (view ? view.breakAfter : isBlockElement(cur2)) || isBlockElement(next) && (cur2.nodeName != "BR" || cur2.cmIgnore))
          this.lineBreak();
        cur2 = next;
      }
      this.findPointBefore(parent, end);
      return this;
    }
    readTextNode(node) {
      let text = node.nodeValue;
      for (let point of this.points)
        if (point.node == node)
          point.pos = this.text.length + Math.min(point.offset, text.length);
      for (let off = 0, re = this.lineSeparator ? null : /\r\n?|\n/g; ; ) {
        let nextBreak = -1, breakSize = 1, m;
        if (this.lineSeparator) {
          nextBreak = text.indexOf(this.lineSeparator, off);
          breakSize = this.lineSeparator.length;
        } else if (m = re.exec(text)) {
          nextBreak = m.index;
          breakSize = m[0].length;
        }
        this.append(text.slice(off, nextBreak < 0 ? text.length : nextBreak));
        if (nextBreak < 0)
          break;
        this.lineBreak();
        if (breakSize > 1) {
          for (let point of this.points)
            if (point.node == node && point.pos > this.text.length)
              point.pos -= breakSize - 1;
        }
        off = nextBreak + breakSize;
      }
    }
    readNode(node) {
      if (node.cmIgnore)
        return;
      let view = ContentView.get(node);
      let fromView = view && view.overrideDOMText;
      if (fromView != null) {
        this.findPointInside(node, fromView.length);
        for (let i = fromView.iter(); !i.next().done; ) {
          if (i.lineBreak)
            this.lineBreak();
          else
            this.append(i.value);
        }
      } else if (node.nodeType == 3) {
        this.readTextNode(node);
      } else if (node.nodeName == "BR") {
        if (node.nextSibling)
          this.lineBreak();
      } else if (node.nodeType == 1) {
        this.readRange(node.firstChild, null);
      }
    }
    findPointBefore(node, next) {
      for (let point of this.points)
        if (point.node == node && node.childNodes[point.offset] == next)
          point.pos = this.text.length;
    }
    findPointInside(node, maxLen) {
      for (let point of this.points)
        if (node.nodeType == 3 ? point.node == node : node.contains(point.node))
          point.pos = this.text.length + Math.min(maxLen, point.offset);
    }
  };
  function isBlockElement(node) {
    return node.nodeType == 1 && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(node.nodeName);
  }
  var DOMPoint = class {
    constructor(node, offset) {
      this.node = node;
      this.offset = offset;
      this.pos = -1;
    }
  };
  var DocView = class extends ContentView {
    constructor(view) {
      super();
      this.view = view;
      this.compositionDeco = Decoration.none;
      this.decorations = [];
      this.dynamicDecorationMap = [];
      this.minWidth = 0;
      this.minWidthFrom = 0;
      this.minWidthTo = 0;
      this.impreciseAnchor = null;
      this.impreciseHead = null;
      this.forceSelection = false;
      this.lastUpdate = Date.now();
      this.setDOM(view.contentDOM);
      this.children = [new LineView()];
      this.children[0].setParent(this);
      this.updateDeco();
      this.updateInner([new ChangedRange(0, 0, 0, view.state.doc.length)], 0);
    }
    get editorView() {
      return this.view;
    }
    get length() {
      return this.view.state.doc.length;
    }
    update(update) {
      let changedRanges = update.changedRanges;
      if (this.minWidth > 0 && changedRanges.length) {
        if (!changedRanges.every(({fromA, toA}) => toA < this.minWidthFrom || fromA > this.minWidthTo)) {
          this.minWidth = this.minWidthFrom = this.minWidthTo = 0;
        } else {
          this.minWidthFrom = update.changes.mapPos(this.minWidthFrom, 1);
          this.minWidthTo = update.changes.mapPos(this.minWidthTo, 1);
        }
      }
      if (this.view.inputState.composing < 0)
        this.compositionDeco = Decoration.none;
      else if (update.transactions.length || this.dirty)
        this.compositionDeco = computeCompositionDeco(this.view, update.changes);
      if ((browser.ie || browser.chrome) && !this.compositionDeco.size && update && update.state.doc.lines != update.startState.doc.lines)
        this.forceSelection = true;
      let prevDeco = this.decorations, deco = this.updateDeco();
      let decoDiff = findChangedDeco(prevDeco, deco, update.changes);
      changedRanges = ChangedRange.extendWithRanges(changedRanges, decoDiff);
      if (this.dirty == 0 && changedRanges.length == 0) {
        return false;
      } else {
        this.updateInner(changedRanges, update.startState.doc.length);
        if (update.transactions.length)
          this.lastUpdate = Date.now();
        return true;
      }
    }
    updateInner(changes, oldLength) {
      this.view.viewState.mustMeasureContent = true;
      this.updateChildren(changes, oldLength);
      let {observer} = this.view;
      observer.ignore(() => {
        this.dom.style.height = this.view.viewState.contentHeight + "px";
        this.dom.style.flexBasis = this.minWidth ? this.minWidth + "px" : "";
        let track = browser.chrome || browser.ios ? {node: observer.selectionRange.focusNode, written: false} : void 0;
        this.sync(track);
        this.dirty = 0;
        if (track && (track.written || observer.selectionRange.focusNode != track.node))
          this.forceSelection = true;
        this.dom.style.height = "";
      });
      let gaps = [];
      if (this.view.viewport.from || this.view.viewport.to < this.view.state.doc.length) {
        for (let child of this.children)
          if (child instanceof BlockWidgetView && child.widget instanceof BlockGapWidget)
            gaps.push(child.dom);
      }
      observer.updateGaps(gaps);
    }
    updateChildren(changes, oldLength) {
      let cursor = this.childCursor(oldLength);
      for (let i = changes.length - 1; ; i--) {
        let next = i >= 0 ? changes[i] : null;
        if (!next)
          break;
        let {fromA, toA, fromB, toB} = next;
        let {content: content2, breakAtStart, openStart, openEnd} = ContentBuilder.build(this.view.state.doc, fromB, toB, this.decorations, this.dynamicDecorationMap);
        let {i: toI, off: toOff} = cursor.findPos(toA, 1);
        let {i: fromI, off: fromOff} = cursor.findPos(fromA, -1);
        replaceRange(this, fromI, fromOff, toI, toOff, content2, breakAtStart, openStart, openEnd);
      }
    }
    updateSelection(mustRead = false, fromPointer = false) {
      if (mustRead || !this.view.observer.selectionRange.focusNode)
        this.view.observer.readSelectionRange();
      if (!(fromPointer || this.mayControlSelection()))
        return;
      let force = this.forceSelection;
      this.forceSelection = false;
      let main = this.view.state.selection.main;
      let anchor = this.domAtPos(main.anchor);
      let head = main.empty ? anchor : this.domAtPos(main.head);
      if (browser.gecko && main.empty && betweenUneditable(anchor)) {
        let dummy = document.createTextNode("");
        this.view.observer.ignore(() => anchor.node.insertBefore(dummy, anchor.node.childNodes[anchor.offset] || null));
        anchor = head = new DOMPos(dummy, 0);
        force = true;
      }
      let domSel = this.view.observer.selectionRange;
      if (force || !domSel.focusNode || !isEquivalentPosition(anchor.node, anchor.offset, domSel.anchorNode, domSel.anchorOffset) || !isEquivalentPosition(head.node, head.offset, domSel.focusNode, domSel.focusOffset)) {
        this.view.observer.ignore(() => {
          if (browser.android && browser.chrome && this.dom.contains(domSel.focusNode) && inUneditable(domSel.focusNode, this.dom)) {
            this.dom.blur();
            this.dom.focus({preventScroll: true});
          }
          let rawSel = getSelection(this.view.root);
          if (!rawSel)
            ;
          else if (main.empty) {
            if (browser.gecko) {
              let nextTo = nextToUneditable(anchor.node, anchor.offset);
              if (nextTo && nextTo != (1 | 2)) {
                let text = nearbyTextNode(anchor.node, anchor.offset, nextTo == 1 ? 1 : -1);
                if (text)
                  anchor = new DOMPos(text, nextTo == 1 ? 0 : text.nodeValue.length);
              }
            }
            rawSel.collapse(anchor.node, anchor.offset);
            if (main.bidiLevel != null && domSel.cursorBidiLevel != null)
              domSel.cursorBidiLevel = main.bidiLevel;
          } else if (rawSel.extend) {
            rawSel.collapse(anchor.node, anchor.offset);
            try {
              rawSel.extend(head.node, head.offset);
            } catch (_) {
            }
          } else {
            let range = document.createRange();
            if (main.anchor > main.head)
              [anchor, head] = [head, anchor];
            range.setEnd(head.node, head.offset);
            range.setStart(anchor.node, anchor.offset);
            rawSel.removeAllRanges();
            rawSel.addRange(range);
          }
        });
        this.view.observer.setSelectionRange(anchor, head);
      }
      this.impreciseAnchor = anchor.precise ? null : new DOMPos(domSel.anchorNode, domSel.anchorOffset);
      this.impreciseHead = head.precise ? null : new DOMPos(domSel.focusNode, domSel.focusOffset);
    }
    enforceCursorAssoc() {
      if (this.compositionDeco.size)
        return;
      let {view} = this, cursor = view.state.selection.main;
      let sel = getSelection(view.root);
      let {anchorNode, anchorOffset} = view.observer.selectionRange;
      if (!sel || !cursor.empty || !cursor.assoc || !sel.modify)
        return;
      let line = LineView.find(this, cursor.head);
      if (!line)
        return;
      let lineStart = line.posAtStart;
      if (cursor.head == lineStart || cursor.head == lineStart + line.length)
        return;
      let before = this.coordsAt(cursor.head, -1), after = this.coordsAt(cursor.head, 1);
      if (!before || !after || before.bottom > after.top)
        return;
      let dom = this.domAtPos(cursor.head + cursor.assoc);
      sel.collapse(dom.node, dom.offset);
      sel.modify("move", cursor.assoc < 0 ? "forward" : "backward", "lineboundary");
      view.observer.readSelectionRange();
      let newRange = view.observer.selectionRange;
      if (view.docView.posFromDOM(newRange.anchorNode, newRange.anchorOffset) != cursor.from)
        sel.collapse(anchorNode, anchorOffset);
    }
    mayControlSelection() {
      let active = this.view.root.activeElement;
      return active == this.dom || hasSelection(this.dom, this.view.observer.selectionRange) && !(active && this.dom.contains(active));
    }
    nearest(dom) {
      for (let cur2 = dom; cur2; ) {
        let domView = ContentView.get(cur2);
        if (domView && domView.rootView == this)
          return domView;
        cur2 = cur2.parentNode;
      }
      return null;
    }
    posFromDOM(node, offset) {
      let view = this.nearest(node);
      if (!view)
        throw new RangeError("Trying to find position for a DOM position outside of the document");
      return view.localPosFromDOM(node, offset) + view.posAtStart;
    }
    domAtPos(pos) {
      let {i, off} = this.childCursor().findPos(pos, -1);
      for (; i < this.children.length - 1; ) {
        let child = this.children[i];
        if (off < child.length || child instanceof LineView)
          break;
        i++;
        off = 0;
      }
      return this.children[i].domAtPos(off);
    }
    coordsAt(pos, side) {
      for (let off = this.length, i = this.children.length - 1; ; i--) {
        let child = this.children[i], start = off - child.breakAfter - child.length;
        if (pos > start || pos == start && child.type != BlockType.WidgetBefore && child.type != BlockType.WidgetAfter && (!i || side == 2 || this.children[i - 1].breakAfter || this.children[i - 1].type == BlockType.WidgetBefore && side > -2))
          return child.coordsAt(pos - start, side);
        off = start;
      }
    }
    measureVisibleLineHeights(viewport) {
      let result = [], {from, to} = viewport;
      let contentWidth = this.view.contentDOM.clientWidth;
      let isWider = contentWidth > Math.max(this.view.scrollDOM.clientWidth, this.minWidth) + 1;
      let widest = -1, ltr = this.view.textDirection == Direction.LTR;
      for (let pos = 0, i = 0; i < this.children.length; i++) {
        let child = this.children[i], end = pos + child.length;
        if (end > to)
          break;
        if (pos >= from) {
          let childRect = child.dom.getBoundingClientRect();
          result.push(childRect.height);
          if (isWider) {
            let last = child.dom.lastChild;
            let rects = last ? clientRectsFor(last) : [];
            if (rects.length) {
              let rect = rects[rects.length - 1];
              let width = ltr ? rect.right - childRect.left : childRect.right - rect.left;
              if (width > widest) {
                widest = width;
                this.minWidth = contentWidth;
                this.minWidthFrom = pos;
                this.minWidthTo = end;
              }
            }
          }
        }
        pos = end + child.breakAfter;
      }
      return result;
    }
    textDirectionAt(pos) {
      let {i} = this.childPos(pos, 1);
      return getComputedStyle(this.children[i].dom).direction == "rtl" ? Direction.RTL : Direction.LTR;
    }
    measureTextSize() {
      for (let child of this.children) {
        if (child instanceof LineView) {
          let measure = child.measureTextSize();
          if (measure)
            return measure;
        }
      }
      let dummy = document.createElement("div"), lineHeight, charWidth;
      dummy.className = "cm-line";
      dummy.style.width = "99999px";
      dummy.textContent = "abc def ghi jkl mno pqr stu";
      this.view.observer.ignore(() => {
        this.dom.appendChild(dummy);
        let rect = clientRectsFor(dummy.firstChild)[0];
        lineHeight = dummy.getBoundingClientRect().height;
        charWidth = rect ? rect.width / 27 : 7;
        dummy.remove();
      });
      return {lineHeight, charWidth};
    }
    childCursor(pos = this.length) {
      let i = this.children.length;
      if (i)
        pos -= this.children[--i].length;
      return new ChildCursor(this.children, pos, i);
    }
    computeBlockGapDeco() {
      let deco = [], vs = this.view.viewState;
      for (let pos = 0, i = 0; ; i++) {
        let next = i == vs.viewports.length ? null : vs.viewports[i];
        let end = next ? next.from - 1 : this.length;
        if (end > pos) {
          let height = vs.lineBlockAt(end).bottom - vs.lineBlockAt(pos).top;
          deco.push(Decoration.replace({
            widget: new BlockGapWidget(height),
            block: true,
            inclusive: true,
            isBlockGap: true
          }).range(pos, end));
        }
        if (!next)
          break;
        pos = next.to + 1;
      }
      return Decoration.set(deco);
    }
    updateDeco() {
      let allDeco = this.view.state.facet(decorations).map((d, i) => {
        let dynamic = this.dynamicDecorationMap[i] = typeof d == "function";
        return dynamic ? d(this.view) : d;
      });
      for (let i = allDeco.length; i < allDeco.length + 3; i++)
        this.dynamicDecorationMap[i] = false;
      return this.decorations = [
        ...allDeco,
        this.compositionDeco,
        this.computeBlockGapDeco(),
        this.view.viewState.lineGapDeco
      ];
    }
    scrollIntoView(target) {
      let {range} = target;
      let rect = this.coordsAt(range.head, range.empty ? range.assoc : range.head > range.anchor ? -1 : 1), other;
      if (!rect)
        return;
      if (!range.empty && (other = this.coordsAt(range.anchor, range.anchor > range.head ? -1 : 1)))
        rect = {
          left: Math.min(rect.left, other.left),
          top: Math.min(rect.top, other.top),
          right: Math.max(rect.right, other.right),
          bottom: Math.max(rect.bottom, other.bottom)
        };
      let mLeft = 0, mRight = 0, mTop = 0, mBottom = 0;
      for (let margins of this.view.state.facet(scrollMargins).map((f) => f(this.view)))
        if (margins) {
          let {left, right, top: top2, bottom} = margins;
          if (left != null)
            mLeft = Math.max(mLeft, left);
          if (right != null)
            mRight = Math.max(mRight, right);
          if (top2 != null)
            mTop = Math.max(mTop, top2);
          if (bottom != null)
            mBottom = Math.max(mBottom, bottom);
        }
      let targetRect = {
        left: rect.left - mLeft,
        top: rect.top - mTop,
        right: rect.right + mRight,
        bottom: rect.bottom + mBottom
      };
      scrollRectIntoView(this.view.scrollDOM, targetRect, range.head < range.anchor ? -1 : 1, target.x, target.y, target.xMargin, target.yMargin, this.view.textDirection == Direction.LTR);
    }
  };
  function betweenUneditable(pos) {
    return pos.node.nodeType == 1 && pos.node.firstChild && (pos.offset == 0 || pos.node.childNodes[pos.offset - 1].contentEditable == "false") && (pos.offset == pos.node.childNodes.length || pos.node.childNodes[pos.offset].contentEditable == "false");
  }
  var BlockGapWidget = class extends WidgetType {
    constructor(height) {
      super();
      this.height = height;
    }
    toDOM() {
      let elt2 = document.createElement("div");
      this.updateDOM(elt2);
      return elt2;
    }
    eq(other) {
      return other.height == this.height;
    }
    updateDOM(elt2) {
      elt2.style.height = this.height + "px";
      return true;
    }
    get estimatedHeight() {
      return this.height;
    }
  };
  function compositionSurroundingNode(view) {
    let sel = view.observer.selectionRange;
    let textNode = sel.focusNode && nearbyTextNode(sel.focusNode, sel.focusOffset, 0);
    if (!textNode)
      return null;
    let cView = view.docView.nearest(textNode);
    if (!cView)
      return null;
    if (cView instanceof LineView) {
      let topNode = textNode;
      while (topNode.parentNode != cView.dom)
        topNode = topNode.parentNode;
      let prev = topNode.previousSibling;
      while (prev && !ContentView.get(prev))
        prev = prev.previousSibling;
      let pos = prev ? ContentView.get(prev).posAtEnd : cView.posAtStart;
      return {from: pos, to: pos, node: topNode, text: textNode};
    } else {
      for (; ; ) {
        let {parent} = cView;
        if (!parent)
          return null;
        if (parent instanceof LineView)
          break;
        cView = parent;
      }
      let from = cView.posAtStart;
      return {from, to: from + cView.length, node: cView.dom, text: textNode};
    }
  }
  function computeCompositionDeco(view, changes) {
    let surrounding = compositionSurroundingNode(view);
    if (!surrounding)
      return Decoration.none;
    let {from, to, node, text: textNode} = surrounding;
    let newFrom = changes.mapPos(from, 1), newTo = Math.max(newFrom, changes.mapPos(to, -1));
    let {state} = view, text = node.nodeType == 3 ? node.nodeValue : new DOMReader([], state).readRange(node.firstChild, null).text;
    if (newTo - newFrom < text.length) {
      if (state.doc.sliceString(newFrom, Math.min(state.doc.length, newFrom + text.length), LineBreakPlaceholder) == text)
        newTo = newFrom + text.length;
      else if (state.doc.sliceString(Math.max(0, newTo - text.length), newTo, LineBreakPlaceholder) == text)
        newFrom = newTo - text.length;
      else
        return Decoration.none;
    } else if (state.doc.sliceString(newFrom, newTo, LineBreakPlaceholder) != text) {
      return Decoration.none;
    }
    let topView = ContentView.get(node);
    if (topView instanceof CompositionView)
      topView = topView.widget.topView;
    else if (topView)
      topView.parent = null;
    return Decoration.set(Decoration.replace({widget: new CompositionWidget(node, textNode, topView), inclusive: true}).range(newFrom, newTo));
  }
  var CompositionWidget = class extends WidgetType {
    constructor(top2, text, topView) {
      super();
      this.top = top2;
      this.text = text;
      this.topView = topView;
    }
    eq(other) {
      return this.top == other.top && this.text == other.text;
    }
    toDOM() {
      return this.top;
    }
    ignoreEvent() {
      return false;
    }
    get customView() {
      return CompositionView;
    }
  };
  function nearbyTextNode(node, offset, side) {
    for (; ; ) {
      if (node.nodeType == 3)
        return node;
      if (node.nodeType == 1 && offset > 0 && side <= 0) {
        node = node.childNodes[offset - 1];
        offset = maxOffset(node);
      } else if (node.nodeType == 1 && offset < node.childNodes.length && side >= 0) {
        node = node.childNodes[offset];
        offset = 0;
      } else {
        return null;
      }
    }
  }
  function nextToUneditable(node, offset) {
    if (node.nodeType != 1)
      return 0;
    return (offset && node.childNodes[offset - 1].contentEditable == "false" ? 1 : 0) | (offset < node.childNodes.length && node.childNodes[offset].contentEditable == "false" ? 2 : 0);
  }
  var DecorationComparator$1 = class {
    constructor() {
      this.changes = [];
    }
    compareRange(from, to) {
      addRange(from, to, this.changes);
    }
    comparePoint(from, to) {
      addRange(from, to, this.changes);
    }
  };
  function findChangedDeco(a, b, diff) {
    let comp = new DecorationComparator$1();
    RangeSet.compare(a, b, diff, comp);
    return comp.changes;
  }
  function inUneditable(node, inside2) {
    for (let cur2 = node; cur2 && cur2 != inside2; cur2 = cur2.assignedSlot || cur2.parentNode) {
      if (cur2.nodeType == 1 && cur2.contentEditable == "false") {
        return true;
      }
    }
    return false;
  }
  function groupAt(state, pos, bias = 1) {
    let categorize = state.charCategorizer(pos);
    let line = state.doc.lineAt(pos), linePos = pos - line.from;
    if (line.length == 0)
      return EditorSelection.cursor(pos);
    if (linePos == 0)
      bias = 1;
    else if (linePos == line.length)
      bias = -1;
    let from = linePos, to = linePos;
    if (bias < 0)
      from = findClusterBreak(line.text, linePos, false);
    else
      to = findClusterBreak(line.text, linePos);
    let cat = categorize(line.text.slice(from, to));
    while (from > 0) {
      let prev = findClusterBreak(line.text, from, false);
      if (categorize(line.text.slice(prev, from)) != cat)
        break;
      from = prev;
    }
    while (to < line.length) {
      let next = findClusterBreak(line.text, to);
      if (categorize(line.text.slice(to, next)) != cat)
        break;
      to = next;
    }
    return EditorSelection.range(from + line.from, to + line.from);
  }
  function getdx(x, rect) {
    return rect.left > x ? rect.left - x : Math.max(0, x - rect.right);
  }
  function getdy(y, rect) {
    return rect.top > y ? rect.top - y : Math.max(0, y - rect.bottom);
  }
  function yOverlap(a, b) {
    return a.top < b.bottom - 1 && a.bottom > b.top + 1;
  }
  function upTop(rect, top2) {
    return top2 < rect.top ? {top: top2, left: rect.left, right: rect.right, bottom: rect.bottom} : rect;
  }
  function upBot(rect, bottom) {
    return bottom > rect.bottom ? {top: rect.top, left: rect.left, right: rect.right, bottom} : rect;
  }
  function domPosAtCoords(parent, x, y) {
    let closest, closestRect, closestX, closestY, closestOverlap = false;
    let above, below, aboveRect, belowRect;
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      let rects = clientRectsFor(child);
      for (let i = 0; i < rects.length; i++) {
        let rect = rects[i];
        if (closestRect && yOverlap(closestRect, rect))
          rect = upTop(upBot(rect, closestRect.bottom), closestRect.top);
        let dx = getdx(x, rect), dy = getdy(y, rect);
        if (dx == 0 && dy == 0)
          return child.nodeType == 3 ? domPosInText(child, x, y) : domPosAtCoords(child, x, y);
        if (!closest || closestY > dy || closestY == dy && closestX > dx) {
          closest = child;
          closestRect = rect;
          closestX = dx;
          closestY = dy;
          closestOverlap = !dx || (dx > 0 ? i < rects.length - 1 : i > 0);
        }
        if (dx == 0) {
          if (y > rect.bottom && (!aboveRect || aboveRect.bottom < rect.bottom)) {
            above = child;
            aboveRect = rect;
          } else if (y < rect.top && (!belowRect || belowRect.top > rect.top)) {
            below = child;
            belowRect = rect;
          }
        } else if (aboveRect && yOverlap(aboveRect, rect)) {
          aboveRect = upBot(aboveRect, rect.bottom);
        } else if (belowRect && yOverlap(belowRect, rect)) {
          belowRect = upTop(belowRect, rect.top);
        }
      }
    }
    if (aboveRect && aboveRect.bottom >= y) {
      closest = above;
      closestRect = aboveRect;
    } else if (belowRect && belowRect.top <= y) {
      closest = below;
      closestRect = belowRect;
    }
    if (!closest)
      return {node: parent, offset: 0};
    let clipX = Math.max(closestRect.left, Math.min(closestRect.right, x));
    if (closest.nodeType == 3)
      return domPosInText(closest, clipX, y);
    if (closestOverlap && closest.contentEditable != "false")
      return domPosAtCoords(closest, clipX, y);
    let offset = Array.prototype.indexOf.call(parent.childNodes, closest) + (x >= (closestRect.left + closestRect.right) / 2 ? 1 : 0);
    return {node: parent, offset};
  }
  function domPosInText(node, x, y) {
    let len = node.nodeValue.length;
    let closestOffset = -1, closestDY = 1e9, generalSide = 0;
    for (let i = 0; i < len; i++) {
      let rects = textRange(node, i, i + 1).getClientRects();
      for (let j = 0; j < rects.length; j++) {
        let rect = rects[j];
        if (rect.top == rect.bottom)
          continue;
        if (!generalSide)
          generalSide = x - rect.left;
        let dy = (rect.top > y ? rect.top - y : y - rect.bottom) - 1;
        if (rect.left - 1 <= x && rect.right + 1 >= x && dy < closestDY) {
          let right = x >= (rect.left + rect.right) / 2, after = right;
          if (browser.chrome || browser.gecko) {
            let rectBefore = textRange(node, i).getBoundingClientRect();
            if (rectBefore.left == rect.right)
              after = !right;
          }
          if (dy <= 0)
            return {node, offset: i + (after ? 1 : 0)};
          closestOffset = i + (after ? 1 : 0);
          closestDY = dy;
        }
      }
    }
    return {node, offset: closestOffset > -1 ? closestOffset : generalSide > 0 ? node.nodeValue.length : 0};
  }
  function posAtCoords(view, {x, y}, precise, bias = -1) {
    var _a2;
    let content2 = view.contentDOM.getBoundingClientRect(), docTop = content2.top + view.viewState.paddingTop;
    let block, {docHeight} = view.viewState;
    let yOffset = y - docTop;
    if (yOffset < 0)
      return 0;
    if (yOffset > docHeight)
      return view.state.doc.length;
    for (let halfLine = view.defaultLineHeight / 2, bounced = false; ; ) {
      block = view.elementAtHeight(yOffset);
      if (block.type == BlockType.Text)
        break;
      for (; ; ) {
        yOffset = bias > 0 ? block.bottom + halfLine : block.top - halfLine;
        if (yOffset >= 0 && yOffset <= docHeight)
          break;
        if (bounced)
          return precise ? null : 0;
        bounced = true;
        bias = -bias;
      }
    }
    y = docTop + yOffset;
    let lineStart = block.from;
    if (lineStart < view.viewport.from)
      return view.viewport.from == 0 ? 0 : precise ? null : posAtCoordsImprecise(view, content2, block, x, y);
    if (lineStart > view.viewport.to)
      return view.viewport.to == view.state.doc.length ? view.state.doc.length : precise ? null : posAtCoordsImprecise(view, content2, block, x, y);
    let doc2 = view.dom.ownerDocument;
    let root = view.root.elementFromPoint ? view.root : doc2;
    let element = root.elementFromPoint(x, y);
    if (element && !view.contentDOM.contains(element))
      element = null;
    if (!element) {
      x = Math.max(content2.left + 1, Math.min(content2.right - 1, x));
      element = root.elementFromPoint(x, y);
      if (element && !view.contentDOM.contains(element))
        element = null;
    }
    let node, offset = -1;
    if (element && ((_a2 = view.docView.nearest(element)) === null || _a2 === void 0 ? void 0 : _a2.isEditable) != false) {
      if (doc2.caretPositionFromPoint) {
        let pos = doc2.caretPositionFromPoint(x, y);
        if (pos)
          ({offsetNode: node, offset} = pos);
      } else if (doc2.caretRangeFromPoint) {
        let range = doc2.caretRangeFromPoint(x, y);
        if (range) {
          ({startContainer: node, startOffset: offset} = range);
          if (!view.contentDOM.contains(node) || browser.safari && isSuspiciousSafariCaretResult(node, offset, x) || browser.chrome && isSuspiciousChromeCaretResult(node, offset, x))
            node = void 0;
        }
      }
    }
    if (!node || !view.docView.dom.contains(node)) {
      let line = LineView.find(view.docView, lineStart);
      if (!line)
        return yOffset > block.top + block.height / 2 ? block.to : block.from;
      ({node, offset} = domPosAtCoords(line.dom, x, y));
    }
    return view.docView.posFromDOM(node, offset);
  }
  function posAtCoordsImprecise(view, contentRect, block, x, y) {
    let into = Math.round((x - contentRect.left) * view.defaultCharacterWidth);
    if (view.lineWrapping && block.height > view.defaultLineHeight * 1.5) {
      let line = Math.floor((y - block.top) / view.defaultLineHeight);
      into += line * view.viewState.heightOracle.lineLength;
    }
    let content2 = view.state.sliceDoc(block.from, block.to);
    return block.from + findColumn(content2, into, view.state.tabSize);
  }
  function isSuspiciousSafariCaretResult(node, offset, x) {
    let len;
    if (node.nodeType != 3 || offset != (len = node.nodeValue.length))
      return false;
    for (let next = node.nextSibling; next; next = next.nextSibling)
      if (next.nodeType != 1 || next.nodeName != "BR")
        return false;
    return textRange(node, len - 1, len).getBoundingClientRect().left > x;
  }
  function isSuspiciousChromeCaretResult(node, offset, x) {
    if (offset != 0)
      return false;
    for (let cur2 = node; ; ) {
      let parent = cur2.parentNode;
      if (!parent || parent.nodeType != 1 || parent.firstChild != cur2)
        return false;
      if (parent.classList.contains("cm-line"))
        break;
      cur2 = parent;
    }
    let rect = node.nodeType == 1 ? node.getBoundingClientRect() : textRange(node, 0, Math.max(node.nodeValue.length, 1)).getBoundingClientRect();
    return x - rect.left > 5;
  }
  function moveToLineBoundary(view, start, forward, includeWrap) {
    let line = view.state.doc.lineAt(start.head);
    let coords = !includeWrap || !view.lineWrapping ? null : view.coordsAtPos(start.assoc < 0 && start.head > line.from ? start.head - 1 : start.head);
    if (coords) {
      let editorRect = view.dom.getBoundingClientRect();
      let direction = view.textDirectionAt(line.from);
      let pos = view.posAtCoords({
        x: forward == (direction == Direction.LTR) ? editorRect.right - 1 : editorRect.left + 1,
        y: (coords.top + coords.bottom) / 2
      });
      if (pos != null)
        return EditorSelection.cursor(pos, forward ? -1 : 1);
    }
    let lineView = LineView.find(view.docView, start.head);
    let end = lineView ? forward ? lineView.posAtEnd : lineView.posAtStart : forward ? line.to : line.from;
    return EditorSelection.cursor(end, forward ? -1 : 1);
  }
  function moveByChar(view, start, forward, by) {
    let line = view.state.doc.lineAt(start.head), spans = view.bidiSpans(line);
    let direction = view.textDirectionAt(line.from);
    for (let cur2 = start, check = null; ; ) {
      let next = moveVisually(line, spans, direction, cur2, forward), char = movedOver;
      if (!next) {
        if (line.number == (forward ? view.state.doc.lines : 1))
          return cur2;
        char = "\n";
        line = view.state.doc.line(line.number + (forward ? 1 : -1));
        spans = view.bidiSpans(line);
        next = EditorSelection.cursor(forward ? line.from : line.to);
      }
      if (!check) {
        if (!by)
          return next;
        check = by(char);
      } else if (!check(char)) {
        return cur2;
      }
      cur2 = next;
    }
  }
  function byGroup(view, pos, start) {
    let categorize = view.state.charCategorizer(pos);
    let cat = categorize(start);
    return (next) => {
      let nextCat = categorize(next);
      if (cat == CharCategory.Space)
        cat = nextCat;
      return cat == nextCat;
    };
  }
  function moveVertically(view, start, forward, distance) {
    let startPos = start.head, dir = forward ? 1 : -1;
    if (startPos == (forward ? view.state.doc.length : 0))
      return EditorSelection.cursor(startPos, start.assoc);
    let goal = start.goalColumn, startY;
    let rect = view.contentDOM.getBoundingClientRect();
    let startCoords = view.coordsAtPos(startPos), docTop = view.documentTop;
    if (startCoords) {
      if (goal == null)
        goal = startCoords.left - rect.left;
      startY = dir < 0 ? startCoords.top : startCoords.bottom;
    } else {
      let line = view.viewState.lineBlockAt(startPos);
      if (goal == null)
        goal = Math.min(rect.right - rect.left, view.defaultCharacterWidth * (startPos - line.from));
      startY = (dir < 0 ? line.top : line.bottom) + docTop;
    }
    let resolvedGoal = rect.left + goal;
    let dist = distance !== null && distance !== void 0 ? distance : view.defaultLineHeight >> 1;
    for (let extra = 0; ; extra += 10) {
      let curY = startY + (dist + extra) * dir;
      let pos = posAtCoords(view, {x: resolvedGoal, y: curY}, false, dir);
      if (curY < rect.top || curY > rect.bottom || (dir < 0 ? pos < startPos : pos > startPos))
        return EditorSelection.cursor(pos, start.assoc, void 0, goal);
    }
  }
  function skipAtoms(view, oldPos, pos) {
    let atoms = view.state.facet(atomicRanges).map((f) => f(view));
    for (; ; ) {
      let moved = false;
      for (let set of atoms) {
        set.between(pos.from - 1, pos.from + 1, (from, to, value) => {
          if (pos.from > from && pos.from < to) {
            pos = oldPos.head > pos.from ? EditorSelection.cursor(from, 1) : EditorSelection.cursor(to, -1);
            moved = true;
          }
        });
      }
      if (!moved)
        return pos;
    }
  }
  var InputState = class {
    constructor(view) {
      this.lastKeyCode = 0;
      this.lastKeyTime = 0;
      this.lastTouchTime = 0;
      this.lastFocusTime = 0;
      this.lastScrollTop = 0;
      this.lastScrollLeft = 0;
      this.chromeScrollHack = -1;
      this.pendingIOSKey = void 0;
      this.lastSelectionOrigin = null;
      this.lastSelectionTime = 0;
      this.lastEscPress = 0;
      this.lastContextMenu = 0;
      this.scrollHandlers = [];
      this.registeredEvents = [];
      this.customHandlers = [];
      this.composing = -1;
      this.compositionFirstChange = null;
      this.compositionEndedAt = 0;
      this.mouseSelection = null;
      for (let type in handlers) {
        let handler = handlers[type];
        view.contentDOM.addEventListener(type, (event) => {
          if (!eventBelongsToEditor(view, event) || this.ignoreDuringComposition(event))
            return;
          if (type == "keydown" && this.keydown(view, event))
            return;
          if (this.mustFlushObserver(event))
            view.observer.forceFlush();
          if (this.runCustomHandlers(type, view, event))
            event.preventDefault();
          else
            handler(view, event);
        }, handlerOptions[type]);
        this.registeredEvents.push(type);
      }
      if (browser.chrome && browser.chrome_version == 102) {
        view.scrollDOM.addEventListener("wheel", () => {
          if (this.chromeScrollHack < 0)
            view.contentDOM.style.pointerEvents = "none";
          else
            window.clearTimeout(this.chromeScrollHack);
          this.chromeScrollHack = setTimeout(() => {
            this.chromeScrollHack = -1;
            view.contentDOM.style.pointerEvents = "";
          }, 100);
        }, {passive: true});
      }
      this.notifiedFocused = view.hasFocus;
      if (browser.safari)
        view.contentDOM.addEventListener("input", () => null);
    }
    setSelectionOrigin(origin) {
      this.lastSelectionOrigin = origin;
      this.lastSelectionTime = Date.now();
    }
    ensureHandlers(view, plugins) {
      var _a2;
      let handlers2;
      this.customHandlers = [];
      for (let plugin of plugins)
        if (handlers2 = (_a2 = plugin.update(view).spec) === null || _a2 === void 0 ? void 0 : _a2.domEventHandlers) {
          this.customHandlers.push({plugin: plugin.value, handlers: handlers2});
          for (let type in handlers2)
            if (this.registeredEvents.indexOf(type) < 0 && type != "scroll") {
              this.registeredEvents.push(type);
              view.contentDOM.addEventListener(type, (event) => {
                if (!eventBelongsToEditor(view, event))
                  return;
                if (this.runCustomHandlers(type, view, event))
                  event.preventDefault();
              });
            }
        }
    }
    runCustomHandlers(type, view, event) {
      for (let set of this.customHandlers) {
        let handler = set.handlers[type];
        if (handler) {
          try {
            if (handler.call(set.plugin, event, view) || event.defaultPrevented)
              return true;
          } catch (e) {
            logException(view.state, e);
          }
        }
      }
      return false;
    }
    runScrollHandlers(view, event) {
      this.lastScrollTop = view.scrollDOM.scrollTop;
      this.lastScrollLeft = view.scrollDOM.scrollLeft;
      for (let set of this.customHandlers) {
        let handler = set.handlers.scroll;
        if (handler) {
          try {
            handler.call(set.plugin, event, view);
          } catch (e) {
            logException(view.state, e);
          }
        }
      }
    }
    keydown(view, event) {
      this.lastKeyCode = event.keyCode;
      this.lastKeyTime = Date.now();
      if (event.keyCode == 9 && Date.now() < this.lastEscPress + 2e3)
        return true;
      if (browser.android && browser.chrome && !event.synthetic && (event.keyCode == 13 || event.keyCode == 8)) {
        view.observer.delayAndroidKey(event.key, event.keyCode);
        return true;
      }
      let pending;
      if (browser.ios && !event.synthetic && !event.altKey && !event.metaKey && ((pending = PendingKeys.find((key) => key.keyCode == event.keyCode)) && !event.ctrlKey || EmacsyPendingKeys.indexOf(event.key) > -1 && event.ctrlKey && !event.shiftKey)) {
        this.pendingIOSKey = pending || event;
        setTimeout(() => this.flushIOSKey(view), 250);
        return true;
      }
      return false;
    }
    flushIOSKey(view) {
      let key = this.pendingIOSKey;
      if (!key)
        return false;
      this.pendingIOSKey = void 0;
      return dispatchKey(view.contentDOM, key.key, key.keyCode);
    }
    ignoreDuringComposition(event) {
      if (!/^key/.test(event.type))
        return false;
      if (this.composing > 0)
        return true;
      if (browser.safari && !browser.ios && Date.now() - this.compositionEndedAt < 100) {
        this.compositionEndedAt = 0;
        return true;
      }
      return false;
    }
    mustFlushObserver(event) {
      return event.type == "keydown" && event.keyCode != 229;
    }
    startMouseSelection(mouseSelection) {
      if (this.mouseSelection)
        this.mouseSelection.destroy();
      this.mouseSelection = mouseSelection;
    }
    update(update) {
      if (this.mouseSelection)
        this.mouseSelection.update(update);
      if (update.transactions.length)
        this.lastKeyCode = this.lastSelectionTime = 0;
    }
    destroy() {
      if (this.mouseSelection)
        this.mouseSelection.destroy();
    }
  };
  var PendingKeys = [
    {key: "Backspace", keyCode: 8, inputType: "deleteContentBackward"},
    {key: "Enter", keyCode: 13, inputType: "insertParagraph"},
    {key: "Delete", keyCode: 46, inputType: "deleteContentForward"}
  ];
  var EmacsyPendingKeys = "dthko";
  var modifierCodes = [16, 17, 18, 20, 91, 92, 224, 225];
  var MouseSelection = class {
    constructor(view, startEvent, style, mustSelect) {
      this.view = view;
      this.style = style;
      this.mustSelect = mustSelect;
      this.lastEvent = startEvent;
      let doc2 = view.contentDOM.ownerDocument;
      doc2.addEventListener("mousemove", this.move = this.move.bind(this));
      doc2.addEventListener("mouseup", this.up = this.up.bind(this));
      this.extend = startEvent.shiftKey;
      this.multiple = view.state.facet(EditorState.allowMultipleSelections) && addsSelectionRange(view, startEvent);
      this.dragMove = dragMovesSelection(view, startEvent);
      this.dragging = isInPrimarySelection(view, startEvent) && getClickType(startEvent) == 1 ? null : false;
      if (this.dragging === false) {
        startEvent.preventDefault();
        this.select(startEvent);
      }
    }
    move(event) {
      if (event.buttons == 0)
        return this.destroy();
      if (this.dragging !== false)
        return;
      this.select(this.lastEvent = event);
    }
    up(event) {
      if (this.dragging == null)
        this.select(this.lastEvent);
      if (!this.dragging)
        event.preventDefault();
      this.destroy();
    }
    destroy() {
      let doc2 = this.view.contentDOM.ownerDocument;
      doc2.removeEventListener("mousemove", this.move);
      doc2.removeEventListener("mouseup", this.up);
      this.view.inputState.mouseSelection = null;
    }
    select(event) {
      let selection = this.style.get(event, this.extend, this.multiple);
      if (this.mustSelect || !selection.eq(this.view.state.selection) || selection.main.assoc != this.view.state.selection.main.assoc)
        this.view.dispatch({
          selection,
          userEvent: "select.pointer",
          scrollIntoView: true
        });
      this.mustSelect = false;
    }
    update(update) {
      if (update.docChanged && this.dragging)
        this.dragging = this.dragging.map(update.changes);
      if (this.style.update(update))
        setTimeout(() => this.select(this.lastEvent), 20);
    }
  };
  function addsSelectionRange(view, event) {
    let facet = view.state.facet(clickAddsSelectionRange);
    return facet.length ? facet[0](event) : browser.mac ? event.metaKey : event.ctrlKey;
  }
  function dragMovesSelection(view, event) {
    let facet = view.state.facet(dragMovesSelection$1);
    return facet.length ? facet[0](event) : browser.mac ? !event.altKey : !event.ctrlKey;
  }
  function isInPrimarySelection(view, event) {
    let {main} = view.state.selection;
    if (main.empty)
      return false;
    let sel = getSelection(view.root);
    if (!sel || sel.rangeCount == 0)
      return true;
    let rects = sel.getRangeAt(0).getClientRects();
    for (let i = 0; i < rects.length; i++) {
      let rect = rects[i];
      if (rect.left <= event.clientX && rect.right >= event.clientX && rect.top <= event.clientY && rect.bottom >= event.clientY)
        return true;
    }
    return false;
  }
  function eventBelongsToEditor(view, event) {
    if (!event.bubbles)
      return true;
    if (event.defaultPrevented)
      return false;
    for (let node = event.target, cView; node != view.contentDOM; node = node.parentNode)
      if (!node || node.nodeType == 11 || (cView = ContentView.get(node)) && cView.ignoreEvent(event))
        return false;
    return true;
  }
  var handlers = /* @__PURE__ */ Object.create(null);
  var handlerOptions = /* @__PURE__ */ Object.create(null);
  var brokenClipboardAPI = browser.ie && browser.ie_version < 15 || browser.ios && browser.webkit_version < 604;
  function capturePaste(view) {
    let parent = view.dom.parentNode;
    if (!parent)
      return;
    let target = parent.appendChild(document.createElement("textarea"));
    target.style.cssText = "position: fixed; left: -10000px; top: 10px";
    target.focus();
    setTimeout(() => {
      view.focus();
      target.remove();
      doPaste(view, target.value);
    }, 50);
  }
  function doPaste(view, input) {
    let {state} = view, changes, i = 1, text = state.toText(input);
    let byLine = text.lines == state.selection.ranges.length;
    let linewise = lastLinewiseCopy != null && state.selection.ranges.every((r) => r.empty) && lastLinewiseCopy == text.toString();
    if (linewise) {
      let lastLine = -1;
      changes = state.changeByRange((range) => {
        let line = state.doc.lineAt(range.from);
        if (line.from == lastLine)
          return {range};
        lastLine = line.from;
        let insert2 = state.toText((byLine ? text.line(i++).text : input) + state.lineBreak);
        return {
          changes: {from: line.from, insert: insert2},
          range: EditorSelection.cursor(range.from + insert2.length)
        };
      });
    } else if (byLine) {
      changes = state.changeByRange((range) => {
        let line = text.line(i++);
        return {
          changes: {from: range.from, to: range.to, insert: line.text},
          range: EditorSelection.cursor(range.from + line.length)
        };
      });
    } else {
      changes = state.replaceSelection(text);
    }
    view.dispatch(changes, {
      userEvent: "input.paste",
      scrollIntoView: true
    });
  }
  handlers.keydown = (view, event) => {
    view.inputState.setSelectionOrigin("select");
    if (event.keyCode == 27)
      view.inputState.lastEscPress = Date.now();
    else if (modifierCodes.indexOf(event.keyCode) < 0)
      view.inputState.lastEscPress = 0;
  };
  handlers.touchstart = (view, e) => {
    view.inputState.lastTouchTime = Date.now();
    view.inputState.setSelectionOrigin("select.pointer");
  };
  handlers.touchmove = (view) => {
    view.inputState.setSelectionOrigin("select.pointer");
  };
  handlerOptions.touchstart = handlerOptions.touchmove = {passive: true};
  handlers.mousedown = (view, event) => {
    view.observer.flush();
    if (view.inputState.lastTouchTime > Date.now() - 2e3)
      return;
    let style = null;
    for (let makeStyle of view.state.facet(mouseSelectionStyle)) {
      style = makeStyle(view, event);
      if (style)
        break;
    }
    if (!style && event.button == 0)
      style = basicMouseSelection(view, event);
    if (style) {
      let mustFocus = view.root.activeElement != view.contentDOM;
      if (mustFocus)
        view.observer.ignore(() => focusPreventScroll(view.contentDOM));
      view.inputState.startMouseSelection(new MouseSelection(view, event, style, mustFocus));
    }
  };
  function rangeForClick(view, pos, bias, type) {
    if (type == 1) {
      return EditorSelection.cursor(pos, bias);
    } else if (type == 2) {
      return groupAt(view.state, pos, bias);
    } else {
      let visual = LineView.find(view.docView, pos), line = view.state.doc.lineAt(visual ? visual.posAtEnd : pos);
      let from = visual ? visual.posAtStart : line.from, to = visual ? visual.posAtEnd : line.to;
      if (to < view.state.doc.length && to == line.to)
        to++;
      return EditorSelection.range(from, to);
    }
  }
  var insideY = (y, rect) => y >= rect.top && y <= rect.bottom;
  var inside = (x, y, rect) => insideY(y, rect) && x >= rect.left && x <= rect.right;
  function findPositionSide(view, pos, x, y) {
    let line = LineView.find(view.docView, pos);
    if (!line)
      return 1;
    let off = pos - line.posAtStart;
    if (off == 0)
      return 1;
    if (off == line.length)
      return -1;
    let before = line.coordsAt(off, -1);
    if (before && inside(x, y, before))
      return -1;
    let after = line.coordsAt(off, 1);
    if (after && inside(x, y, after))
      return 1;
    return before && insideY(y, before) ? -1 : 1;
  }
  function queryPos(view, event) {
    let pos = view.posAtCoords({x: event.clientX, y: event.clientY}, false);
    return {pos, bias: findPositionSide(view, pos, event.clientX, event.clientY)};
  }
  var BadMouseDetail = browser.ie && browser.ie_version <= 11;
  var lastMouseDown = null;
  var lastMouseDownCount = 0;
  var lastMouseDownTime = 0;
  function getClickType(event) {
    if (!BadMouseDetail)
      return event.detail;
    let last = lastMouseDown, lastTime = lastMouseDownTime;
    lastMouseDown = event;
    lastMouseDownTime = Date.now();
    return lastMouseDownCount = !last || lastTime > Date.now() - 400 && Math.abs(last.clientX - event.clientX) < 2 && Math.abs(last.clientY - event.clientY) < 2 ? (lastMouseDownCount + 1) % 3 : 1;
  }
  function basicMouseSelection(view, event) {
    let start = queryPos(view, event), type = getClickType(event);
    let startSel = view.state.selection;
    let last = start, lastEvent = event;
    return {
      update(update) {
        if (update.docChanged) {
          start.pos = update.changes.mapPos(start.pos);
          startSel = startSel.map(update.changes);
          lastEvent = null;
        }
      },
      get(event2, extend2, multiple) {
        let cur2;
        if (lastEvent && event2.clientX == lastEvent.clientX && event2.clientY == lastEvent.clientY)
          cur2 = last;
        else {
          cur2 = last = queryPos(view, event2);
          lastEvent = event2;
        }
        let range = rangeForClick(view, cur2.pos, cur2.bias, type);
        if (start.pos != cur2.pos && !extend2) {
          let startRange = rangeForClick(view, start.pos, start.bias, type);
          let from = Math.min(startRange.from, range.from), to = Math.max(startRange.to, range.to);
          range = from < range.from ? EditorSelection.range(from, to) : EditorSelection.range(to, from);
        }
        if (extend2)
          return startSel.replaceRange(startSel.main.extend(range.from, range.to));
        else if (multiple && startSel.ranges.length > 1 && startSel.ranges.some((r) => r.eq(range)))
          return removeRange(startSel, range);
        else if (multiple)
          return startSel.addRange(range);
        else
          return EditorSelection.create([range]);
      }
    };
  }
  function removeRange(sel, range) {
    for (let i = 0; ; i++) {
      if (sel.ranges[i].eq(range))
        return EditorSelection.create(sel.ranges.slice(0, i).concat(sel.ranges.slice(i + 1)), sel.mainIndex == i ? 0 : sel.mainIndex - (sel.mainIndex > i ? 1 : 0));
    }
  }
  handlers.dragstart = (view, event) => {
    let {selection: {main}} = view.state;
    let {mouseSelection} = view.inputState;
    if (mouseSelection)
      mouseSelection.dragging = main;
    if (event.dataTransfer) {
      event.dataTransfer.setData("Text", view.state.sliceDoc(main.from, main.to));
      event.dataTransfer.effectAllowed = "copyMove";
    }
  };
  function dropText(view, event, text, direct) {
    if (!text)
      return;
    let dropPos = view.posAtCoords({x: event.clientX, y: event.clientY}, false);
    event.preventDefault();
    let {mouseSelection} = view.inputState;
    let del = direct && mouseSelection && mouseSelection.dragging && mouseSelection.dragMove ? {from: mouseSelection.dragging.from, to: mouseSelection.dragging.to} : null;
    let ins = {from: dropPos, insert: text};
    let changes = view.state.changes(del ? [del, ins] : ins);
    view.focus();
    view.dispatch({
      changes,
      selection: {anchor: changes.mapPos(dropPos, -1), head: changes.mapPos(dropPos, 1)},
      userEvent: del ? "move.drop" : "input.drop"
    });
  }
  handlers.drop = (view, event) => {
    if (!event.dataTransfer)
      return;
    if (view.state.readOnly)
      return event.preventDefault();
    let files = event.dataTransfer.files;
    if (files && files.length) {
      event.preventDefault();
      let text = Array(files.length), read = 0;
      let finishFile = () => {
        if (++read == files.length)
          dropText(view, event, text.filter((s) => s != null).join(view.state.lineBreak), false);
      };
      for (let i = 0; i < files.length; i++) {
        let reader = new FileReader();
        reader.onerror = finishFile;
        reader.onload = () => {
          if (!/[\x00-\x08\x0e-\x1f]{2}/.test(reader.result))
            text[i] = reader.result;
          finishFile();
        };
        reader.readAsText(files[i]);
      }
    } else {
      dropText(view, event, event.dataTransfer.getData("Text"), true);
    }
  };
  handlers.paste = (view, event) => {
    if (view.state.readOnly)
      return event.preventDefault();
    view.observer.flush();
    let data2 = brokenClipboardAPI ? null : event.clipboardData;
    if (data2) {
      doPaste(view, data2.getData("text/plain"));
      event.preventDefault();
    } else {
      capturePaste(view);
    }
  };
  function captureCopy(view, text) {
    let parent = view.dom.parentNode;
    if (!parent)
      return;
    let target = parent.appendChild(document.createElement("textarea"));
    target.style.cssText = "position: fixed; left: -10000px; top: 10px";
    target.value = text;
    target.focus();
    target.selectionEnd = text.length;
    target.selectionStart = 0;
    setTimeout(() => {
      target.remove();
      view.focus();
    }, 50);
  }
  function copiedRange(state) {
    let content2 = [], ranges = [], linewise = false;
    for (let range of state.selection.ranges)
      if (!range.empty) {
        content2.push(state.sliceDoc(range.from, range.to));
        ranges.push(range);
      }
    if (!content2.length) {
      let upto = -1;
      for (let {from} of state.selection.ranges) {
        let line = state.doc.lineAt(from);
        if (line.number > upto) {
          content2.push(line.text);
          ranges.push({from: line.from, to: Math.min(state.doc.length, line.to + 1)});
        }
        upto = line.number;
      }
      linewise = true;
    }
    return {text: content2.join(state.lineBreak), ranges, linewise};
  }
  var lastLinewiseCopy = null;
  handlers.copy = handlers.cut = (view, event) => {
    let {text, ranges, linewise} = copiedRange(view.state);
    if (!text && !linewise)
      return;
    lastLinewiseCopy = linewise ? text : null;
    let data2 = brokenClipboardAPI ? null : event.clipboardData;
    if (data2) {
      event.preventDefault();
      data2.clearData();
      data2.setData("text/plain", text);
    } else {
      captureCopy(view, text);
    }
    if (event.type == "cut" && !view.state.readOnly)
      view.dispatch({
        changes: ranges,
        scrollIntoView: true,
        userEvent: "delete.cut"
      });
  };
  function updateForFocusChange(view) {
    setTimeout(() => {
      if (view.hasFocus != view.inputState.notifiedFocused)
        view.update([]);
    }, 10);
  }
  handlers.focus = (view) => {
    view.inputState.lastFocusTime = Date.now();
    if (!view.scrollDOM.scrollTop && (view.inputState.lastScrollTop || view.inputState.lastScrollLeft)) {
      view.scrollDOM.scrollTop = view.inputState.lastScrollTop;
      view.scrollDOM.scrollLeft = view.inputState.lastScrollLeft;
    }
    updateForFocusChange(view);
  };
  handlers.blur = (view) => {
    view.observer.clearSelectionRange();
    updateForFocusChange(view);
  };
  handlers.compositionstart = handlers.compositionupdate = (view) => {
    if (view.inputState.compositionFirstChange == null)
      view.inputState.compositionFirstChange = true;
    if (view.inputState.composing < 0) {
      view.inputState.composing = 0;
    }
  };
  handlers.compositionend = (view) => {
    view.inputState.composing = -1;
    view.inputState.compositionEndedAt = Date.now();
    view.inputState.compositionFirstChange = null;
    if (browser.chrome && browser.android)
      view.observer.flushSoon();
    setTimeout(() => {
      if (view.inputState.composing < 0 && view.docView.compositionDeco.size)
        view.update([]);
    }, 50);
  };
  handlers.contextmenu = (view) => {
    view.inputState.lastContextMenu = Date.now();
  };
  handlers.beforeinput = (view, event) => {
    var _a2;
    let pending;
    if (browser.chrome && browser.android && (pending = PendingKeys.find((key) => key.inputType == event.inputType))) {
      view.observer.delayAndroidKey(pending.key, pending.keyCode);
      if (pending.key == "Backspace" || pending.key == "Delete") {
        let startViewHeight = ((_a2 = window.visualViewport) === null || _a2 === void 0 ? void 0 : _a2.height) || 0;
        setTimeout(() => {
          var _a3;
          if ((((_a3 = window.visualViewport) === null || _a3 === void 0 ? void 0 : _a3.height) || 0) > startViewHeight + 10 && view.hasFocus) {
            view.contentDOM.blur();
            view.focus();
          }
        }, 100);
      }
    }
  };
  var wrappingWhiteSpace = ["pre-wrap", "normal", "pre-line", "break-spaces"];
  var HeightOracle = class {
    constructor(lineWrapping) {
      this.lineWrapping = lineWrapping;
      this.doc = Text.empty;
      this.heightSamples = {};
      this.lineHeight = 14;
      this.charWidth = 7;
      this.lineLength = 30;
      this.heightChanged = false;
    }
    heightForGap(from, to) {
      let lines = this.doc.lineAt(to).number - this.doc.lineAt(from).number + 1;
      if (this.lineWrapping)
        lines += Math.ceil((to - from - lines * this.lineLength * 0.5) / this.lineLength);
      return this.lineHeight * lines;
    }
    heightForLine(length) {
      if (!this.lineWrapping)
        return this.lineHeight;
      let lines = 1 + Math.max(0, Math.ceil((length - this.lineLength) / (this.lineLength - 5)));
      return lines * this.lineHeight;
    }
    setDoc(doc2) {
      this.doc = doc2;
      return this;
    }
    mustRefreshForWrapping(whiteSpace) {
      return wrappingWhiteSpace.indexOf(whiteSpace) > -1 != this.lineWrapping;
    }
    mustRefreshForHeights(lineHeights) {
      let newHeight = false;
      for (let i = 0; i < lineHeights.length; i++) {
        let h = lineHeights[i];
        if (h < 0) {
          i++;
        } else if (!this.heightSamples[Math.floor(h * 10)]) {
          newHeight = true;
          this.heightSamples[Math.floor(h * 10)] = true;
        }
      }
      return newHeight;
    }
    refresh(whiteSpace, lineHeight, charWidth, lineLength, knownHeights) {
      let lineWrapping = wrappingWhiteSpace.indexOf(whiteSpace) > -1;
      let changed = Math.round(lineHeight) != Math.round(this.lineHeight) || this.lineWrapping != lineWrapping;
      this.lineWrapping = lineWrapping;
      this.lineHeight = lineHeight;
      this.charWidth = charWidth;
      this.lineLength = lineLength;
      if (changed) {
        this.heightSamples = {};
        for (let i = 0; i < knownHeights.length; i++) {
          let h = knownHeights[i];
          if (h < 0)
            i++;
          else
            this.heightSamples[Math.floor(h * 10)] = true;
        }
      }
      return changed;
    }
  };
  var MeasuredHeights = class {
    constructor(from, heights) {
      this.from = from;
      this.heights = heights;
      this.index = 0;
    }
    get more() {
      return this.index < this.heights.length;
    }
  };
  var BlockInfo = class {
    constructor(from, length, top2, height, type) {
      this.from = from;
      this.length = length;
      this.top = top2;
      this.height = height;
      this.type = type;
    }
    get to() {
      return this.from + this.length;
    }
    get bottom() {
      return this.top + this.height;
    }
    join(other) {
      let detail = (Array.isArray(this.type) ? this.type : [this]).concat(Array.isArray(other.type) ? other.type : [other]);
      return new BlockInfo(this.from, this.length + other.length, this.top, this.height + other.height, detail);
    }
  };
  var QueryType = /* @__PURE__ */ function(QueryType2) {
    QueryType2[QueryType2["ByPos"] = 0] = "ByPos";
    QueryType2[QueryType2["ByHeight"] = 1] = "ByHeight";
    QueryType2[QueryType2["ByPosNoHeight"] = 2] = "ByPosNoHeight";
    return QueryType2;
  }(QueryType || (QueryType = {}));
  var Epsilon = 1e-3;
  var HeightMap = class {
    constructor(length, height, flags = 2) {
      this.length = length;
      this.height = height;
      this.flags = flags;
    }
    get outdated() {
      return (this.flags & 2) > 0;
    }
    set outdated(value) {
      this.flags = (value ? 2 : 0) | this.flags & ~2;
    }
    setHeight(oracle, height) {
      if (this.height != height) {
        if (Math.abs(this.height - height) > Epsilon)
          oracle.heightChanged = true;
        this.height = height;
      }
    }
    replace(_from, _to, nodes) {
      return HeightMap.of(nodes);
    }
    decomposeLeft(_to, result) {
      result.push(this);
    }
    decomposeRight(_from, result) {
      result.push(this);
    }
    applyChanges(decorations2, oldDoc, oracle, changes) {
      let me = this;
      for (let i = changes.length - 1; i >= 0; i--) {
        let {fromA, toA, fromB, toB} = changes[i];
        let start = me.lineAt(fromA, QueryType.ByPosNoHeight, oldDoc, 0, 0);
        let end = start.to >= toA ? start : me.lineAt(toA, QueryType.ByPosNoHeight, oldDoc, 0, 0);
        toB += end.to - toA;
        toA = end.to;
        while (i > 0 && start.from <= changes[i - 1].toA) {
          fromA = changes[i - 1].fromA;
          fromB = changes[i - 1].fromB;
          i--;
          if (fromA < start.from)
            start = me.lineAt(fromA, QueryType.ByPosNoHeight, oldDoc, 0, 0);
        }
        fromB += start.from - fromA;
        fromA = start.from;
        let nodes = NodeBuilder.build(oracle, decorations2, fromB, toB);
        me = me.replace(fromA, toA, nodes);
      }
      return me.updateHeight(oracle, 0);
    }
    static empty() {
      return new HeightMapText(0, 0);
    }
    static of(nodes) {
      if (nodes.length == 1)
        return nodes[0];
      let i = 0, j = nodes.length, before = 0, after = 0;
      for (; ; ) {
        if (i == j) {
          if (before > after * 2) {
            let split = nodes[i - 1];
            if (split.break)
              nodes.splice(--i, 1, split.left, null, split.right);
            else
              nodes.splice(--i, 1, split.left, split.right);
            j += 1 + split.break;
            before -= split.size;
          } else if (after > before * 2) {
            let split = nodes[j];
            if (split.break)
              nodes.splice(j, 1, split.left, null, split.right);
            else
              nodes.splice(j, 1, split.left, split.right);
            j += 2 + split.break;
            after -= split.size;
          } else {
            break;
          }
        } else if (before < after) {
          let next = nodes[i++];
          if (next)
            before += next.size;
        } else {
          let next = nodes[--j];
          if (next)
            after += next.size;
        }
      }
      let brk = 0;
      if (nodes[i - 1] == null) {
        brk = 1;
        i--;
      } else if (nodes[i] == null) {
        brk = 1;
        j++;
      }
      return new HeightMapBranch(HeightMap.of(nodes.slice(0, i)), brk, HeightMap.of(nodes.slice(j)));
    }
  };
  HeightMap.prototype.size = 1;
  var HeightMapBlock = class extends HeightMap {
    constructor(length, height, type) {
      super(length, height);
      this.type = type;
    }
    blockAt(_height, _doc, top2, offset) {
      return new BlockInfo(offset, this.length, top2, this.height, this.type);
    }
    lineAt(_value, _type, doc2, top2, offset) {
      return this.blockAt(0, doc2, top2, offset);
    }
    forEachLine(from, to, doc2, top2, offset, f) {
      if (from <= offset + this.length && to >= offset)
        f(this.blockAt(0, doc2, top2, offset));
    }
    updateHeight(oracle, offset = 0, _force = false, measured) {
      if (measured && measured.from <= offset && measured.more)
        this.setHeight(oracle, measured.heights[measured.index++]);
      this.outdated = false;
      return this;
    }
    toString() {
      return `block(${this.length})`;
    }
  };
  var HeightMapText = class extends HeightMapBlock {
    constructor(length, height) {
      super(length, height, BlockType.Text);
      this.collapsed = 0;
      this.widgetHeight = 0;
    }
    replace(_from, _to, nodes) {
      let node = nodes[0];
      if (nodes.length == 1 && (node instanceof HeightMapText || node instanceof HeightMapGap && node.flags & 4) && Math.abs(this.length - node.length) < 10) {
        if (node instanceof HeightMapGap)
          node = new HeightMapText(node.length, this.height);
        else
          node.height = this.height;
        if (!this.outdated)
          node.outdated = false;
        return node;
      } else {
        return HeightMap.of(nodes);
      }
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      if (measured && measured.from <= offset && measured.more)
        this.setHeight(oracle, measured.heights[measured.index++]);
      else if (force || this.outdated)
        this.setHeight(oracle, Math.max(this.widgetHeight, oracle.heightForLine(this.length - this.collapsed)));
      this.outdated = false;
      return this;
    }
    toString() {
      return `line(${this.length}${this.collapsed ? -this.collapsed : ""}${this.widgetHeight ? ":" + this.widgetHeight : ""})`;
    }
  };
  var HeightMapGap = class extends HeightMap {
    constructor(length) {
      super(length, 0);
    }
    lines(doc2, offset) {
      let firstLine = doc2.lineAt(offset).number, lastLine = doc2.lineAt(offset + this.length).number;
      return {firstLine, lastLine, lineHeight: this.height / (lastLine - firstLine + 1)};
    }
    blockAt(height, doc2, top2, offset) {
      let {firstLine, lastLine, lineHeight} = this.lines(doc2, offset);
      let line = Math.max(0, Math.min(lastLine - firstLine, Math.floor((height - top2) / lineHeight)));
      let {from, length} = doc2.line(firstLine + line);
      return new BlockInfo(from, length, top2 + lineHeight * line, lineHeight, BlockType.Text);
    }
    lineAt(value, type, doc2, top2, offset) {
      if (type == QueryType.ByHeight)
        return this.blockAt(value, doc2, top2, offset);
      if (type == QueryType.ByPosNoHeight) {
        let {from: from2, to} = doc2.lineAt(value);
        return new BlockInfo(from2, to - from2, 0, 0, BlockType.Text);
      }
      let {firstLine, lineHeight} = this.lines(doc2, offset);
      let {from, length, number: number2} = doc2.lineAt(value);
      return new BlockInfo(from, length, top2 + lineHeight * (number2 - firstLine), lineHeight, BlockType.Text);
    }
    forEachLine(from, to, doc2, top2, offset, f) {
      let {firstLine, lineHeight} = this.lines(doc2, offset);
      for (let pos = Math.max(from, offset), end = Math.min(offset + this.length, to); pos <= end; ) {
        let line = doc2.lineAt(pos);
        if (pos == from)
          top2 += lineHeight * (line.number - firstLine);
        f(new BlockInfo(line.from, line.length, top2, lineHeight, BlockType.Text));
        top2 += lineHeight;
        pos = line.to + 1;
      }
    }
    replace(from, to, nodes) {
      let after = this.length - to;
      if (after > 0) {
        let last = nodes[nodes.length - 1];
        if (last instanceof HeightMapGap)
          nodes[nodes.length - 1] = new HeightMapGap(last.length + after);
        else
          nodes.push(null, new HeightMapGap(after - 1));
      }
      if (from > 0) {
        let first = nodes[0];
        if (first instanceof HeightMapGap)
          nodes[0] = new HeightMapGap(from + first.length);
        else
          nodes.unshift(new HeightMapGap(from - 1), null);
      }
      return HeightMap.of(nodes);
    }
    decomposeLeft(to, result) {
      result.push(new HeightMapGap(to - 1), null);
    }
    decomposeRight(from, result) {
      result.push(null, new HeightMapGap(this.length - from - 1));
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      let end = offset + this.length;
      if (measured && measured.from <= offset + this.length && measured.more) {
        let nodes = [], pos = Math.max(offset, measured.from), singleHeight = -1;
        let wasChanged = oracle.heightChanged;
        if (measured.from > offset)
          nodes.push(new HeightMapGap(measured.from - offset - 1).updateHeight(oracle, offset));
        while (pos <= end && measured.more) {
          let len = oracle.doc.lineAt(pos).length;
          if (nodes.length)
            nodes.push(null);
          let height = measured.heights[measured.index++];
          if (singleHeight == -1)
            singleHeight = height;
          else if (Math.abs(height - singleHeight) >= Epsilon)
            singleHeight = -2;
          let line = new HeightMapText(len, height);
          line.outdated = false;
          nodes.push(line);
          pos += len + 1;
        }
        if (pos <= end)
          nodes.push(null, new HeightMapGap(end - pos).updateHeight(oracle, pos));
        let result = HeightMap.of(nodes);
        oracle.heightChanged = wasChanged || singleHeight < 0 || Math.abs(result.height - this.height) >= Epsilon || Math.abs(singleHeight - this.lines(oracle.doc, offset).lineHeight) >= Epsilon;
        return result;
      } else if (force || this.outdated) {
        this.setHeight(oracle, oracle.heightForGap(offset, offset + this.length));
        this.outdated = false;
      }
      return this;
    }
    toString() {
      return `gap(${this.length})`;
    }
  };
  var HeightMapBranch = class extends HeightMap {
    constructor(left, brk, right) {
      super(left.length + brk + right.length, left.height + right.height, brk | (left.outdated || right.outdated ? 2 : 0));
      this.left = left;
      this.right = right;
      this.size = left.size + right.size;
    }
    get break() {
      return this.flags & 1;
    }
    blockAt(height, doc2, top2, offset) {
      let mid = top2 + this.left.height;
      return height < mid ? this.left.blockAt(height, doc2, top2, offset) : this.right.blockAt(height, doc2, mid, offset + this.left.length + this.break);
    }
    lineAt(value, type, doc2, top2, offset) {
      let rightTop = top2 + this.left.height, rightOffset = offset + this.left.length + this.break;
      let left = type == QueryType.ByHeight ? value < rightTop : value < rightOffset;
      let base2 = left ? this.left.lineAt(value, type, doc2, top2, offset) : this.right.lineAt(value, type, doc2, rightTop, rightOffset);
      if (this.break || (left ? base2.to < rightOffset : base2.from > rightOffset))
        return base2;
      let subQuery = type == QueryType.ByPosNoHeight ? QueryType.ByPosNoHeight : QueryType.ByPos;
      if (left)
        return base2.join(this.right.lineAt(rightOffset, subQuery, doc2, rightTop, rightOffset));
      else
        return this.left.lineAt(rightOffset, subQuery, doc2, top2, offset).join(base2);
    }
    forEachLine(from, to, doc2, top2, offset, f) {
      let rightTop = top2 + this.left.height, rightOffset = offset + this.left.length + this.break;
      if (this.break) {
        if (from < rightOffset)
          this.left.forEachLine(from, to, doc2, top2, offset, f);
        if (to >= rightOffset)
          this.right.forEachLine(from, to, doc2, rightTop, rightOffset, f);
      } else {
        let mid = this.lineAt(rightOffset, QueryType.ByPos, doc2, top2, offset);
        if (from < mid.from)
          this.left.forEachLine(from, mid.from - 1, doc2, top2, offset, f);
        if (mid.to >= from && mid.from <= to)
          f(mid);
        if (to > mid.to)
          this.right.forEachLine(mid.to + 1, to, doc2, rightTop, rightOffset, f);
      }
    }
    replace(from, to, nodes) {
      let rightStart = this.left.length + this.break;
      if (to < rightStart)
        return this.balanced(this.left.replace(from, to, nodes), this.right);
      if (from > this.left.length)
        return this.balanced(this.left, this.right.replace(from - rightStart, to - rightStart, nodes));
      let result = [];
      if (from > 0)
        this.decomposeLeft(from, result);
      let left = result.length;
      for (let node of nodes)
        result.push(node);
      if (from > 0)
        mergeGaps(result, left - 1);
      if (to < this.length) {
        let right = result.length;
        this.decomposeRight(to, result);
        mergeGaps(result, right);
      }
      return HeightMap.of(result);
    }
    decomposeLeft(to, result) {
      let left = this.left.length;
      if (to <= left)
        return this.left.decomposeLeft(to, result);
      result.push(this.left);
      if (this.break) {
        left++;
        if (to >= left)
          result.push(null);
      }
      if (to > left)
        this.right.decomposeLeft(to - left, result);
    }
    decomposeRight(from, result) {
      let left = this.left.length, right = left + this.break;
      if (from >= right)
        return this.right.decomposeRight(from - right, result);
      if (from < left)
        this.left.decomposeRight(from, result);
      if (this.break && from < right)
        result.push(null);
      result.push(this.right);
    }
    balanced(left, right) {
      if (left.size > 2 * right.size || right.size > 2 * left.size)
        return HeightMap.of(this.break ? [left, null, right] : [left, right]);
      this.left = left;
      this.right = right;
      this.height = left.height + right.height;
      this.outdated = left.outdated || right.outdated;
      this.size = left.size + right.size;
      this.length = left.length + this.break + right.length;
      return this;
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      let {left, right} = this, rightStart = offset + left.length + this.break, rebalance = null;
      if (measured && measured.from <= offset + left.length && measured.more)
        rebalance = left = left.updateHeight(oracle, offset, force, measured);
      else
        left.updateHeight(oracle, offset, force);
      if (measured && measured.from <= rightStart + right.length && measured.more)
        rebalance = right = right.updateHeight(oracle, rightStart, force, measured);
      else
        right.updateHeight(oracle, rightStart, force);
      if (rebalance)
        return this.balanced(left, right);
      this.height = this.left.height + this.right.height;
      this.outdated = false;
      return this;
    }
    toString() {
      return this.left + (this.break ? " " : "-") + this.right;
    }
  };
  function mergeGaps(nodes, around) {
    let before, after;
    if (nodes[around] == null && (before = nodes[around - 1]) instanceof HeightMapGap && (after = nodes[around + 1]) instanceof HeightMapGap)
      nodes.splice(around - 1, 3, new HeightMapGap(before.length + 1 + after.length));
  }
  var relevantWidgetHeight = 5;
  var NodeBuilder = class {
    constructor(pos, oracle) {
      this.pos = pos;
      this.oracle = oracle;
      this.nodes = [];
      this.lineStart = -1;
      this.lineEnd = -1;
      this.covering = null;
      this.writtenTo = pos;
    }
    get isCovered() {
      return this.covering && this.nodes[this.nodes.length - 1] == this.covering;
    }
    span(_from, to) {
      if (this.lineStart > -1) {
        let end = Math.min(to, this.lineEnd), last = this.nodes[this.nodes.length - 1];
        if (last instanceof HeightMapText)
          last.length += end - this.pos;
        else if (end > this.pos || !this.isCovered)
          this.nodes.push(new HeightMapText(end - this.pos, -1));
        this.writtenTo = end;
        if (to > end) {
          this.nodes.push(null);
          this.writtenTo++;
          this.lineStart = -1;
        }
      }
      this.pos = to;
    }
    point(from, to, deco) {
      if (from < to || deco.heightRelevant) {
        let height = deco.widget ? deco.widget.estimatedHeight : 0;
        if (height < 0)
          height = this.oracle.lineHeight;
        let len = to - from;
        if (deco.block) {
          this.addBlock(new HeightMapBlock(len, height, deco.type));
        } else if (len || height >= relevantWidgetHeight) {
          this.addLineDeco(height, len);
        }
      } else if (to > from) {
        this.span(from, to);
      }
      if (this.lineEnd > -1 && this.lineEnd < this.pos)
        this.lineEnd = this.oracle.doc.lineAt(this.pos).to;
    }
    enterLine() {
      if (this.lineStart > -1)
        return;
      let {from, to} = this.oracle.doc.lineAt(this.pos);
      this.lineStart = from;
      this.lineEnd = to;
      if (this.writtenTo < from) {
        if (this.writtenTo < from - 1 || this.nodes[this.nodes.length - 1] == null)
          this.nodes.push(this.blankContent(this.writtenTo, from - 1));
        this.nodes.push(null);
      }
      if (this.pos > from)
        this.nodes.push(new HeightMapText(this.pos - from, -1));
      this.writtenTo = this.pos;
    }
    blankContent(from, to) {
      let gap = new HeightMapGap(to - from);
      if (this.oracle.doc.lineAt(from).to == to)
        gap.flags |= 4;
      return gap;
    }
    ensureLine() {
      this.enterLine();
      let last = this.nodes.length ? this.nodes[this.nodes.length - 1] : null;
      if (last instanceof HeightMapText)
        return last;
      let line = new HeightMapText(0, -1);
      this.nodes.push(line);
      return line;
    }
    addBlock(block) {
      this.enterLine();
      if (block.type == BlockType.WidgetAfter && !this.isCovered)
        this.ensureLine();
      this.nodes.push(block);
      this.writtenTo = this.pos = this.pos + block.length;
      if (block.type != BlockType.WidgetBefore)
        this.covering = block;
    }
    addLineDeco(height, length) {
      let line = this.ensureLine();
      line.length += length;
      line.collapsed += length;
      line.widgetHeight = Math.max(line.widgetHeight, height);
      this.writtenTo = this.pos = this.pos + length;
    }
    finish(from) {
      let last = this.nodes.length == 0 ? null : this.nodes[this.nodes.length - 1];
      if (this.lineStart > -1 && !(last instanceof HeightMapText) && !this.isCovered)
        this.nodes.push(new HeightMapText(0, -1));
      else if (this.writtenTo < this.pos || last == null)
        this.nodes.push(this.blankContent(this.writtenTo, this.pos));
      let pos = from;
      for (let node of this.nodes) {
        if (node instanceof HeightMapText)
          node.updateHeight(this.oracle, pos);
        pos += node ? node.length : 1;
      }
      return this.nodes;
    }
    static build(oracle, decorations2, from, to) {
      let builder = new NodeBuilder(from, oracle);
      RangeSet.spans(decorations2, from, to, builder, 0);
      return builder.finish(from);
    }
  };
  function heightRelevantDecoChanges(a, b, diff) {
    let comp = new DecorationComparator();
    RangeSet.compare(a, b, diff, comp, 0);
    return comp.changes;
  }
  var DecorationComparator = class {
    constructor() {
      this.changes = [];
    }
    compareRange() {
    }
    comparePoint(from, to, a, b) {
      if (from < to || a && a.heightRelevant || b && b.heightRelevant)
        addRange(from, to, this.changes, 5);
    }
  };
  function visiblePixelRange(dom, paddingTop) {
    let rect = dom.getBoundingClientRect();
    let doc2 = dom.ownerDocument, win = doc2.defaultView || window;
    let left = Math.max(0, rect.left), right = Math.min(win.innerWidth, rect.right);
    let top2 = Math.max(0, rect.top), bottom = Math.min(win.innerHeight, rect.bottom);
    for (let parent = dom.parentNode; parent && parent != doc2.body; ) {
      if (parent.nodeType == 1) {
        let elt2 = parent;
        let style = window.getComputedStyle(elt2);
        if ((elt2.scrollHeight > elt2.clientHeight || elt2.scrollWidth > elt2.clientWidth) && style.overflow != "visible") {
          let parentRect = elt2.getBoundingClientRect();
          left = Math.max(left, parentRect.left);
          right = Math.min(right, parentRect.right);
          top2 = Math.max(top2, parentRect.top);
          bottom = parent == dom.parentNode ? parentRect.bottom : Math.min(bottom, parentRect.bottom);
        }
        parent = style.position == "absolute" || style.position == "fixed" ? elt2.offsetParent : elt2.parentNode;
      } else if (parent.nodeType == 11) {
        parent = parent.host;
      } else {
        break;
      }
    }
    return {
      left: left - rect.left,
      right: Math.max(left, right) - rect.left,
      top: top2 - (rect.top + paddingTop),
      bottom: Math.max(top2, bottom) - (rect.top + paddingTop)
    };
  }
  function fullPixelRange(dom, paddingTop) {
    let rect = dom.getBoundingClientRect();
    return {
      left: 0,
      right: rect.right - rect.left,
      top: paddingTop,
      bottom: rect.bottom - (rect.top + paddingTop)
    };
  }
  var LineGap = class {
    constructor(from, to, size) {
      this.from = from;
      this.to = to;
      this.size = size;
    }
    static same(a, b) {
      if (a.length != b.length)
        return false;
      for (let i = 0; i < a.length; i++) {
        let gA = a[i], gB = b[i];
        if (gA.from != gB.from || gA.to != gB.to || gA.size != gB.size)
          return false;
      }
      return true;
    }
    draw(wrapping) {
      return Decoration.replace({widget: new LineGapWidget(this.size, wrapping)}).range(this.from, this.to);
    }
  };
  var LineGapWidget = class extends WidgetType {
    constructor(size, vertical) {
      super();
      this.size = size;
      this.vertical = vertical;
    }
    eq(other) {
      return other.size == this.size && other.vertical == this.vertical;
    }
    toDOM() {
      let elt2 = document.createElement("div");
      if (this.vertical) {
        elt2.style.height = this.size + "px";
      } else {
        elt2.style.width = this.size + "px";
        elt2.style.height = "2px";
        elt2.style.display = "inline-block";
      }
      return elt2;
    }
    get estimatedHeight() {
      return this.vertical ? this.size : -1;
    }
  };
  var ViewState = class {
    constructor(state) {
      this.state = state;
      this.pixelViewport = {left: 0, right: window.innerWidth, top: 0, bottom: 0};
      this.inView = true;
      this.paddingTop = 0;
      this.paddingBottom = 0;
      this.contentDOMWidth = 0;
      this.contentDOMHeight = 0;
      this.editorHeight = 0;
      this.editorWidth = 0;
      this.scaler = IdScaler;
      this.scrollTarget = null;
      this.printing = false;
      this.mustMeasureContent = true;
      this.defaultTextDirection = Direction.LTR;
      this.visibleRanges = [];
      this.mustEnforceCursorAssoc = false;
      let guessWrapping = state.facet(contentAttributes).some((v) => typeof v != "function" && v.class == "cm-lineWrapping");
      this.heightOracle = new HeightOracle(guessWrapping);
      this.stateDeco = state.facet(decorations).filter((d) => typeof d != "function");
      this.heightMap = HeightMap.empty().applyChanges(this.stateDeco, Text.empty, this.heightOracle.setDoc(state.doc), [new ChangedRange(0, 0, 0, state.doc.length)]);
      this.viewport = this.getViewport(0, null);
      this.updateViewportLines();
      this.updateForViewport();
      this.lineGaps = this.ensureLineGaps([]);
      this.lineGapDeco = Decoration.set(this.lineGaps.map((gap) => gap.draw(false)));
      this.computeVisibleRanges();
    }
    updateForViewport() {
      let viewports = [this.viewport], {main} = this.state.selection;
      for (let i = 0; i <= 1; i++) {
        let pos = i ? main.head : main.anchor;
        if (!viewports.some(({from, to}) => pos >= from && pos <= to)) {
          let {from, to} = this.lineBlockAt(pos);
          viewports.push(new Viewport(from, to));
        }
      }
      this.viewports = viewports.sort((a, b) => a.from - b.from);
      this.scaler = this.heightMap.height <= 7e6 ? IdScaler : new BigScaler(this.heightOracle.doc, this.heightMap, this.viewports);
    }
    updateViewportLines() {
      this.viewportLines = [];
      this.heightMap.forEachLine(this.viewport.from, this.viewport.to, this.state.doc, 0, 0, (block) => {
        this.viewportLines.push(this.scaler.scale == 1 ? block : scaleBlock(block, this.scaler));
      });
    }
    update(update, scrollTarget = null) {
      this.state = update.state;
      let prevDeco = this.stateDeco;
      this.stateDeco = this.state.facet(decorations).filter((d) => typeof d != "function");
      let contentChanges = update.changedRanges;
      let heightChanges = ChangedRange.extendWithRanges(contentChanges, heightRelevantDecoChanges(prevDeco, this.stateDeco, update ? update.changes : ChangeSet.empty(this.state.doc.length)));
      let prevHeight = this.heightMap.height;
      this.heightMap = this.heightMap.applyChanges(this.stateDeco, update.startState.doc, this.heightOracle.setDoc(this.state.doc), heightChanges);
      if (this.heightMap.height != prevHeight)
        update.flags |= 2;
      let viewport = heightChanges.length ? this.mapViewport(this.viewport, update.changes) : this.viewport;
      if (scrollTarget && (scrollTarget.range.head < viewport.from || scrollTarget.range.head > viewport.to) || !this.viewportIsAppropriate(viewport))
        viewport = this.getViewport(0, scrollTarget);
      let updateLines = !update.changes.empty || update.flags & 2 || viewport.from != this.viewport.from || viewport.to != this.viewport.to;
      this.viewport = viewport;
      this.updateForViewport();
      if (updateLines)
        this.updateViewportLines();
      if (this.lineGaps.length || this.viewport.to - this.viewport.from > 2e3 << 1)
        this.updateLineGaps(this.ensureLineGaps(this.mapLineGaps(this.lineGaps, update.changes)));
      update.flags |= this.computeVisibleRanges();
      if (scrollTarget)
        this.scrollTarget = scrollTarget;
      if (!this.mustEnforceCursorAssoc && update.selectionSet && update.view.lineWrapping && update.state.selection.main.empty && update.state.selection.main.assoc && !update.state.facet(nativeSelectionHidden))
        this.mustEnforceCursorAssoc = true;
    }
    measure(view) {
      let dom = view.contentDOM, style = window.getComputedStyle(dom);
      let oracle = this.heightOracle;
      let whiteSpace = style.whiteSpace;
      this.defaultTextDirection = style.direction == "rtl" ? Direction.RTL : Direction.LTR;
      let refresh = this.heightOracle.mustRefreshForWrapping(whiteSpace);
      let measureContent = refresh || this.mustMeasureContent || this.contentDOMHeight != dom.clientHeight;
      this.contentDOMHeight = dom.clientHeight;
      this.mustMeasureContent = false;
      let result = 0, bias = 0;
      let paddingTop = parseInt(style.paddingTop) || 0, paddingBottom = parseInt(style.paddingBottom) || 0;
      if (this.paddingTop != paddingTop || this.paddingBottom != paddingBottom) {
        this.paddingTop = paddingTop;
        this.paddingBottom = paddingBottom;
        result |= 8 | 2;
      }
      if (this.editorWidth != view.scrollDOM.clientWidth) {
        if (oracle.lineWrapping)
          measureContent = true;
        this.editorWidth = view.scrollDOM.clientWidth;
        result |= 8;
      }
      let pixelViewport = (this.printing ? fullPixelRange : visiblePixelRange)(dom, this.paddingTop);
      let dTop = pixelViewport.top - this.pixelViewport.top, dBottom = pixelViewport.bottom - this.pixelViewport.bottom;
      this.pixelViewport = pixelViewport;
      let inView = this.pixelViewport.bottom > this.pixelViewport.top && this.pixelViewport.right > this.pixelViewport.left;
      if (inView != this.inView) {
        this.inView = inView;
        if (inView)
          measureContent = true;
      }
      if (!this.inView && !this.scrollTarget)
        return 0;
      let contentWidth = dom.clientWidth;
      if (this.contentDOMWidth != contentWidth || this.editorHeight != view.scrollDOM.clientHeight) {
        this.contentDOMWidth = contentWidth;
        this.editorHeight = view.scrollDOM.clientHeight;
        result |= 8;
      }
      if (measureContent) {
        let lineHeights = view.docView.measureVisibleLineHeights(this.viewport);
        if (oracle.mustRefreshForHeights(lineHeights))
          refresh = true;
        if (refresh || oracle.lineWrapping && Math.abs(contentWidth - this.contentDOMWidth) > oracle.charWidth) {
          let {lineHeight, charWidth} = view.docView.measureTextSize();
          refresh = lineHeight > 0 && oracle.refresh(whiteSpace, lineHeight, charWidth, contentWidth / charWidth, lineHeights);
          if (refresh) {
            view.docView.minWidth = 0;
            result |= 8;
          }
        }
        if (dTop > 0 && dBottom > 0)
          bias = Math.max(dTop, dBottom);
        else if (dTop < 0 && dBottom < 0)
          bias = Math.min(dTop, dBottom);
        oracle.heightChanged = false;
        for (let vp of this.viewports) {
          let heights = vp.from == this.viewport.from ? lineHeights : view.docView.measureVisibleLineHeights(vp);
          this.heightMap = (refresh ? HeightMap.empty().applyChanges(this.stateDeco, Text.empty, this.heightOracle, [new ChangedRange(0, 0, 0, view.state.doc.length)]) : this.heightMap).updateHeight(oracle, 0, refresh, new MeasuredHeights(vp.from, heights));
        }
        if (oracle.heightChanged)
          result |= 2;
      }
      let viewportChange = !this.viewportIsAppropriate(this.viewport, bias) || this.scrollTarget && (this.scrollTarget.range.head < this.viewport.from || this.scrollTarget.range.head > this.viewport.to);
      if (viewportChange)
        this.viewport = this.getViewport(bias, this.scrollTarget);
      this.updateForViewport();
      if (result & 2 || viewportChange)
        this.updateViewportLines();
      if (this.lineGaps.length || this.viewport.to - this.viewport.from > 2e3 << 1)
        this.updateLineGaps(this.ensureLineGaps(refresh ? [] : this.lineGaps, view));
      result |= this.computeVisibleRanges();
      if (this.mustEnforceCursorAssoc) {
        this.mustEnforceCursorAssoc = false;
        view.docView.enforceCursorAssoc();
      }
      return result;
    }
    get visibleTop() {
      return this.scaler.fromDOM(this.pixelViewport.top);
    }
    get visibleBottom() {
      return this.scaler.fromDOM(this.pixelViewport.bottom);
    }
    getViewport(bias, scrollTarget) {
      let marginTop = 0.5 - Math.max(-0.5, Math.min(0.5, bias / 1e3 / 2));
      let map = this.heightMap, doc2 = this.state.doc, {visibleTop, visibleBottom} = this;
      let viewport = new Viewport(map.lineAt(visibleTop - marginTop * 1e3, QueryType.ByHeight, doc2, 0, 0).from, map.lineAt(visibleBottom + (1 - marginTop) * 1e3, QueryType.ByHeight, doc2, 0, 0).to);
      if (scrollTarget) {
        let {head} = scrollTarget.range;
        if (head < viewport.from || head > viewport.to) {
          let viewHeight = Math.min(this.editorHeight, this.pixelViewport.bottom - this.pixelViewport.top);
          let block = map.lineAt(head, QueryType.ByPos, doc2, 0, 0), topPos;
          if (scrollTarget.y == "center")
            topPos = (block.top + block.bottom) / 2 - viewHeight / 2;
          else if (scrollTarget.y == "start" || scrollTarget.y == "nearest" && head < viewport.from)
            topPos = block.top;
          else
            topPos = block.bottom - viewHeight;
          viewport = new Viewport(map.lineAt(topPos - 1e3 / 2, QueryType.ByHeight, doc2, 0, 0).from, map.lineAt(topPos + viewHeight + 1e3 / 2, QueryType.ByHeight, doc2, 0, 0).to);
        }
      }
      return viewport;
    }
    mapViewport(viewport, changes) {
      let from = changes.mapPos(viewport.from, -1), to = changes.mapPos(viewport.to, 1);
      return new Viewport(this.heightMap.lineAt(from, QueryType.ByPos, this.state.doc, 0, 0).from, this.heightMap.lineAt(to, QueryType.ByPos, this.state.doc, 0, 0).to);
    }
    viewportIsAppropriate({from, to}, bias = 0) {
      if (!this.inView)
        return true;
      let {top: top2} = this.heightMap.lineAt(from, QueryType.ByPos, this.state.doc, 0, 0);
      let {bottom} = this.heightMap.lineAt(to, QueryType.ByPos, this.state.doc, 0, 0);
      let {visibleTop, visibleBottom} = this;
      return (from == 0 || top2 <= visibleTop - Math.max(10, Math.min(-bias, 250))) && (to == this.state.doc.length || bottom >= visibleBottom + Math.max(10, Math.min(bias, 250))) && (top2 > visibleTop - 2 * 1e3 && bottom < visibleBottom + 2 * 1e3);
    }
    mapLineGaps(gaps, changes) {
      if (!gaps.length || changes.empty)
        return gaps;
      let mapped = [];
      for (let gap of gaps)
        if (!changes.touchesRange(gap.from, gap.to))
          mapped.push(new LineGap(changes.mapPos(gap.from), changes.mapPos(gap.to), gap.size));
      return mapped;
    }
    ensureLineGaps(current, mayMeasure) {
      let wrapping = this.heightOracle.lineWrapping;
      let margin = wrapping ? 1e4 : 2e3, halfMargin = margin >> 1, doubleMargin = margin << 1;
      if (this.defaultTextDirection != Direction.LTR && !wrapping)
        return [];
      let gaps = [];
      let addGap = (from, to, line, structure) => {
        if (to - from < halfMargin)
          return;
        let sel = this.state.selection.main, avoid = [sel.from];
        if (!sel.empty)
          avoid.push(sel.to);
        for (let pos of avoid) {
          if (pos > from && pos < to) {
            addGap(from, pos - 10, line, structure);
            addGap(pos + 10, to, line, structure);
            return;
          }
        }
        let gap = find(current, (gap2) => gap2.from >= line.from && gap2.to <= line.to && Math.abs(gap2.from - from) < halfMargin && Math.abs(gap2.to - to) < halfMargin && !avoid.some((pos) => gap2.from < pos && gap2.to > pos));
        if (!gap) {
          if (to < line.to && mayMeasure && wrapping && mayMeasure.visibleRanges.some((r) => r.from <= to && r.to >= to)) {
            let lineStart = mayMeasure.moveToLineBoundary(EditorSelection.cursor(to), false, true).head;
            if (lineStart > from)
              to = lineStart;
          }
          gap = new LineGap(from, to, this.gapSize(line, from, to, structure));
        }
        gaps.push(gap);
      };
      for (let line of this.viewportLines) {
        if (line.length < doubleMargin)
          continue;
        let structure = lineStructure(line.from, line.to, this.stateDeco);
        if (structure.total < doubleMargin)
          continue;
        let target = this.scrollTarget ? this.scrollTarget.range.head : null;
        let viewFrom, viewTo;
        if (wrapping) {
          let marginHeight = margin / this.heightOracle.lineLength * this.heightOracle.lineHeight;
          let top2, bot;
          if (target != null) {
            let targetFrac = findFraction(structure, target);
            let spaceFrac = ((this.visibleBottom - this.visibleTop) / 2 + marginHeight) / line.height;
            top2 = targetFrac - spaceFrac;
            bot = targetFrac + spaceFrac;
          } else {
            top2 = (this.visibleTop - line.top - marginHeight) / line.height;
            bot = (this.visibleBottom - line.top + marginHeight) / line.height;
          }
          viewFrom = findPosition(structure, top2);
          viewTo = findPosition(structure, bot);
        } else {
          let totalWidth = structure.total * this.heightOracle.charWidth;
          let marginWidth = margin * this.heightOracle.charWidth;
          let left, right;
          if (target != null) {
            let targetFrac = findFraction(structure, target);
            let spaceFrac = ((this.pixelViewport.right - this.pixelViewport.left) / 2 + marginWidth) / totalWidth;
            left = targetFrac - spaceFrac;
            right = targetFrac + spaceFrac;
          } else {
            left = (this.pixelViewport.left - marginWidth) / totalWidth;
            right = (this.pixelViewport.right + marginWidth) / totalWidth;
          }
          viewFrom = findPosition(structure, left);
          viewTo = findPosition(structure, right);
        }
        if (viewFrom > line.from)
          addGap(line.from, viewFrom, line, structure);
        if (viewTo < line.to)
          addGap(viewTo, line.to, line, structure);
      }
      return gaps;
    }
    gapSize(line, from, to, structure) {
      let fraction = findFraction(structure, to) - findFraction(structure, from);
      if (this.heightOracle.lineWrapping) {
        return line.height * fraction;
      } else {
        return structure.total * this.heightOracle.charWidth * fraction;
      }
    }
    updateLineGaps(gaps) {
      if (!LineGap.same(gaps, this.lineGaps)) {
        this.lineGaps = gaps;
        this.lineGapDeco = Decoration.set(gaps.map((gap) => gap.draw(this.heightOracle.lineWrapping)));
      }
    }
    computeVisibleRanges() {
      let deco = this.stateDeco;
      if (this.lineGaps.length)
        deco = deco.concat(this.lineGapDeco);
      let ranges = [];
      RangeSet.spans(deco, this.viewport.from, this.viewport.to, {
        span(from, to) {
          ranges.push({from, to});
        },
        point() {
        }
      }, 20);
      let changed = ranges.length != this.visibleRanges.length || this.visibleRanges.some((r, i) => r.from != ranges[i].from || r.to != ranges[i].to);
      this.visibleRanges = ranges;
      return changed ? 4 : 0;
    }
    lineBlockAt(pos) {
      return pos >= this.viewport.from && pos <= this.viewport.to && this.viewportLines.find((b) => b.from <= pos && b.to >= pos) || scaleBlock(this.heightMap.lineAt(pos, QueryType.ByPos, this.state.doc, 0, 0), this.scaler);
    }
    lineBlockAtHeight(height) {
      return scaleBlock(this.heightMap.lineAt(this.scaler.fromDOM(height), QueryType.ByHeight, this.state.doc, 0, 0), this.scaler);
    }
    elementAtHeight(height) {
      return scaleBlock(this.heightMap.blockAt(this.scaler.fromDOM(height), this.state.doc, 0, 0), this.scaler);
    }
    get docHeight() {
      return this.scaler.toDOM(this.heightMap.height);
    }
    get contentHeight() {
      return this.docHeight + this.paddingTop + this.paddingBottom;
    }
  };
  var Viewport = class {
    constructor(from, to) {
      this.from = from;
      this.to = to;
    }
  };
  function lineStructure(from, to, stateDeco) {
    let ranges = [], pos = from, total = 0;
    RangeSet.spans(stateDeco, from, to, {
      span() {
      },
      point(from2, to2) {
        if (from2 > pos) {
          ranges.push({from: pos, to: from2});
          total += from2 - pos;
        }
        pos = to2;
      }
    }, 20);
    if (pos < to) {
      ranges.push({from: pos, to});
      total += to - pos;
    }
    return {total, ranges};
  }
  function findPosition({total, ranges}, ratio) {
    if (ratio <= 0)
      return ranges[0].from;
    if (ratio >= 1)
      return ranges[ranges.length - 1].to;
    let dist = Math.floor(total * ratio);
    for (let i = 0; ; i++) {
      let {from, to} = ranges[i], size = to - from;
      if (dist <= size)
        return from + dist;
      dist -= size;
    }
  }
  function findFraction(structure, pos) {
    let counted = 0;
    for (let {from, to} of structure.ranges) {
      if (pos <= to) {
        counted += pos - from;
        break;
      }
      counted += to - from;
    }
    return counted / structure.total;
  }
  function find(array, f) {
    for (let val of array)
      if (f(val))
        return val;
    return void 0;
  }
  var IdScaler = {
    toDOM(n) {
      return n;
    },
    fromDOM(n) {
      return n;
    },
    scale: 1
  };
  var BigScaler = class {
    constructor(doc2, heightMap, viewports) {
      let vpHeight = 0, base2 = 0, domBase = 0;
      this.viewports = viewports.map(({from, to}) => {
        let top2 = heightMap.lineAt(from, QueryType.ByPos, doc2, 0, 0).top;
        let bottom = heightMap.lineAt(to, QueryType.ByPos, doc2, 0, 0).bottom;
        vpHeight += bottom - top2;
        return {from, to, top: top2, bottom, domTop: 0, domBottom: 0};
      });
      this.scale = (7e6 - vpHeight) / (heightMap.height - vpHeight);
      for (let obj of this.viewports) {
        obj.domTop = domBase + (obj.top - base2) * this.scale;
        domBase = obj.domBottom = obj.domTop + (obj.bottom - obj.top);
        base2 = obj.bottom;
      }
    }
    toDOM(n) {
      for (let i = 0, base2 = 0, domBase = 0; ; i++) {
        let vp = i < this.viewports.length ? this.viewports[i] : null;
        if (!vp || n < vp.top)
          return domBase + (n - base2) * this.scale;
        if (n <= vp.bottom)
          return vp.domTop + (n - vp.top);
        base2 = vp.bottom;
        domBase = vp.domBottom;
      }
    }
    fromDOM(n) {
      for (let i = 0, base2 = 0, domBase = 0; ; i++) {
        let vp = i < this.viewports.length ? this.viewports[i] : null;
        if (!vp || n < vp.domTop)
          return base2 + (n - domBase) / this.scale;
        if (n <= vp.domBottom)
          return vp.top + (n - vp.domTop);
        base2 = vp.bottom;
        domBase = vp.domBottom;
      }
    }
  };
  function scaleBlock(block, scaler) {
    if (scaler.scale == 1)
      return block;
    let bTop = scaler.toDOM(block.top), bBottom = scaler.toDOM(block.bottom);
    return new BlockInfo(block.from, block.length, bTop, bBottom - bTop, Array.isArray(block.type) ? block.type.map((b) => scaleBlock(b, scaler)) : block.type);
  }
  var theme = /* @__PURE__ */ Facet.define({combine: (strs) => strs.join(" ")});
  var darkTheme = /* @__PURE__ */ Facet.define({combine: (values2) => values2.indexOf(true) > -1});
  var baseThemeID = /* @__PURE__ */ StyleModule.newName();
  var baseLightID = /* @__PURE__ */ StyleModule.newName();
  var baseDarkID = /* @__PURE__ */ StyleModule.newName();
  var lightDarkIDs = {"&light": "." + baseLightID, "&dark": "." + baseDarkID};
  function buildTheme(main, spec, scopes) {
    return new StyleModule(spec, {
      finish(sel) {
        return /&/.test(sel) ? sel.replace(/&\w*/, (m) => {
          if (m == "&")
            return main;
          if (!scopes || !scopes[m])
            throw new RangeError(`Unsupported selector: ${m}`);
          return scopes[m];
        }) : main + " " + sel;
      }
    });
  }
  var baseTheme$1 = /* @__PURE__ */ buildTheme("." + baseThemeID, {
    "&.cm-editor": {
      position: "relative !important",
      boxSizing: "border-box",
      "&.cm-focused": {
        outline: "1px dotted #212121"
      },
      display: "flex !important",
      flexDirection: "column"
    },
    ".cm-scroller": {
      display: "flex !important",
      alignItems: "flex-start !important",
      fontFamily: "monospace",
      lineHeight: 1.4,
      height: "100%",
      overflowX: "auto",
      position: "relative",
      zIndex: 0
    },
    ".cm-content": {
      margin: 0,
      flexGrow: 2,
      flexShrink: 0,
      minHeight: "100%",
      display: "block",
      whiteSpace: "pre",
      wordWrap: "normal",
      boxSizing: "border-box",
      padding: "4px 0",
      outline: "none",
      "&[contenteditable=true]": {
        WebkitUserModify: "read-write-plaintext-only"
      }
    },
    ".cm-lineWrapping": {
      whiteSpace_fallback: "pre-wrap",
      whiteSpace: "break-spaces",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      flexShrink: 1
    },
    "&light .cm-content": {caretColor: "black"},
    "&dark .cm-content": {caretColor: "white"},
    ".cm-line": {
      display: "block",
      padding: "0 2px 0 4px"
    },
    ".cm-selectionLayer": {
      zIndex: -1,
      contain: "size style"
    },
    ".cm-selectionBackground": {
      position: "absolute"
    },
    "&light .cm-selectionBackground": {
      background: "#d9d9d9"
    },
    "&dark .cm-selectionBackground": {
      background: "#222"
    },
    "&light.cm-focused .cm-selectionBackground": {
      background: "#d7d4f0"
    },
    "&dark.cm-focused .cm-selectionBackground": {
      background: "#233"
    },
    ".cm-cursorLayer": {
      zIndex: 100,
      contain: "size style",
      pointerEvents: "none"
    },
    "&.cm-focused .cm-cursorLayer": {
      animation: "steps(1) cm-blink 1.2s infinite"
    },
    "@keyframes cm-blink": {"0%": {}, "50%": {opacity: 0}, "100%": {}},
    "@keyframes cm-blink2": {"0%": {}, "50%": {opacity: 0}, "100%": {}},
    ".cm-cursor, .cm-dropCursor": {
      position: "absolute",
      borderLeft: "1.2px solid black",
      marginLeft: "-0.6px",
      pointerEvents: "none"
    },
    ".cm-cursor": {
      display: "none"
    },
    "&dark .cm-cursor": {
      borderLeftColor: "#444"
    },
    "&.cm-focused .cm-cursor": {
      display: "block"
    },
    "&light .cm-activeLine": {backgroundColor: "#cceeff44"},
    "&dark .cm-activeLine": {backgroundColor: "#99eeff33"},
    "&light .cm-specialChar": {color: "red"},
    "&dark .cm-specialChar": {color: "#f78"},
    ".cm-gutters": {
      flexShrink: 0,
      display: "flex",
      height: "100%",
      boxSizing: "border-box",
      left: 0,
      zIndex: 200
    },
    "&light .cm-gutters": {
      backgroundColor: "#f5f5f5",
      color: "#6c6c6c",
      borderRight: "1px solid #ddd"
    },
    "&dark .cm-gutters": {
      backgroundColor: "#333338",
      color: "#ccc"
    },
    ".cm-gutter": {
      display: "flex !important",
      flexDirection: "column",
      flexShrink: 0,
      boxSizing: "border-box",
      minHeight: "100%",
      overflow: "hidden"
    },
    ".cm-gutterElement": {
      boxSizing: "border-box"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 3px 0 5px",
      minWidth: "20px",
      textAlign: "right",
      whiteSpace: "nowrap"
    },
    "&light .cm-activeLineGutter": {
      backgroundColor: "#e2f2ff"
    },
    "&dark .cm-activeLineGutter": {
      backgroundColor: "#222227"
    },
    ".cm-panels": {
      boxSizing: "border-box",
      position: "sticky",
      left: 0,
      right: 0
    },
    "&light .cm-panels": {
      backgroundColor: "#f5f5f5",
      color: "black"
    },
    "&light .cm-panels-top": {
      borderBottom: "1px solid #ddd"
    },
    "&light .cm-panels-bottom": {
      borderTop: "1px solid #ddd"
    },
    "&dark .cm-panels": {
      backgroundColor: "#333338",
      color: "white"
    },
    ".cm-tab": {
      display: "inline-block",
      overflow: "hidden",
      verticalAlign: "bottom"
    },
    ".cm-widgetBuffer": {
      verticalAlign: "text-top",
      height: "1em",
      width: 0,
      display: "inline"
    },
    ".cm-placeholder": {
      color: "#888",
      display: "inline-block",
      verticalAlign: "top"
    },
    ".cm-button": {
      verticalAlign: "middle",
      color: "inherit",
      fontSize: "70%",
      padding: ".2em 1em",
      borderRadius: "1px"
    },
    "&light .cm-button": {
      backgroundImage: "linear-gradient(#eff1f5, #d9d9df)",
      border: "1px solid #888",
      "&:active": {
        backgroundImage: "linear-gradient(#b4b4b4, #d0d3d6)"
      }
    },
    "&dark .cm-button": {
      backgroundImage: "linear-gradient(#393939, #111)",
      border: "1px solid #888",
      "&:active": {
        backgroundImage: "linear-gradient(#111, #333)"
      }
    },
    ".cm-textfield": {
      verticalAlign: "middle",
      color: "inherit",
      fontSize: "70%",
      border: "1px solid silver",
      padding: ".2em .5em"
    },
    "&light .cm-textfield": {
      backgroundColor: "white"
    },
    "&dark .cm-textfield": {
      border: "1px solid #555",
      backgroundColor: "inherit"
    }
  }, lightDarkIDs);
  var DOMChange = class {
    constructor(view, start, end, typeOver) {
      this.typeOver = typeOver;
      this.bounds = null;
      this.text = "";
      let {impreciseHead: iHead, impreciseAnchor: iAnchor} = view.docView;
      if (view.state.readOnly && start > -1) {
        this.newSel = null;
      } else if (start > -1 && (this.bounds = view.docView.domBoundsAround(start, end, 0))) {
        let selPoints = iHead || iAnchor ? [] : selectionPoints(view);
        let reader = new DOMReader(selPoints, view.state);
        reader.readRange(this.bounds.startDOM, this.bounds.endDOM);
        this.text = reader.text;
        this.newSel = selectionFromPoints(selPoints, this.bounds.from);
      } else {
        let domSel = view.observer.selectionRange;
        let head = iHead && iHead.node == domSel.focusNode && iHead.offset == domSel.focusOffset || !contains(view.contentDOM, domSel.focusNode) ? view.state.selection.main.head : view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset);
        let anchor = iAnchor && iAnchor.node == domSel.anchorNode && iAnchor.offset == domSel.anchorOffset || !contains(view.contentDOM, domSel.anchorNode) ? view.state.selection.main.anchor : view.docView.posFromDOM(domSel.anchorNode, domSel.anchorOffset);
        this.newSel = EditorSelection.single(anchor, head);
      }
    }
  };
  function applyDOMChange(view, domChange) {
    let change;
    let {newSel} = domChange, sel = view.state.selection.main;
    if (domChange.bounds) {
      let {from, to} = domChange.bounds;
      let preferredPos = sel.from, preferredSide = null;
      if (view.inputState.lastKeyCode === 8 && view.inputState.lastKeyTime > Date.now() - 100 || browser.android && domChange.text.length < to - from) {
        preferredPos = sel.to;
        preferredSide = "end";
      }
      let diff = findDiff(view.state.doc.sliceString(from, to, LineBreakPlaceholder), domChange.text, preferredPos - from, preferredSide);
      if (diff) {
        if (browser.chrome && view.inputState.lastKeyCode == 13 && diff.toB == diff.from + 2 && domChange.text.slice(diff.from, diff.toB) == LineBreakPlaceholder + LineBreakPlaceholder)
          diff.toB--;
        change = {
          from: from + diff.from,
          to: from + diff.toA,
          insert: Text.of(domChange.text.slice(diff.from, diff.toB).split(LineBreakPlaceholder))
        };
      }
    } else if (newSel && (!view.hasFocus || !view.state.facet(editable) || newSel.main.eq(sel))) {
      newSel = null;
    }
    if (!change && !newSel)
      return false;
    if (!change && domChange.typeOver && !sel.empty && newSel && newSel.main.empty) {
      change = {from: sel.from, to: sel.to, insert: view.state.doc.slice(sel.from, sel.to)};
    } else if (change && change.from >= sel.from && change.to <= sel.to && (change.from != sel.from || change.to != sel.to) && sel.to - sel.from - (change.to - change.from) <= 4) {
      change = {
        from: sel.from,
        to: sel.to,
        insert: view.state.doc.slice(sel.from, change.from).append(change.insert).append(view.state.doc.slice(change.to, sel.to))
      };
    } else if ((browser.mac || browser.android) && change && change.from == change.to && change.from == sel.head - 1 && /^\. ?$/.test(change.insert.toString())) {
      if (newSel && change.insert.length == 2)
        newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1);
      change = {from: sel.from, to: sel.to, insert: Text.of([" "])};
    } else if (browser.chrome && change && change.from == change.to && change.from == sel.head && change.insert.toString() == "\n " && view.lineWrapping) {
      if (newSel)
        newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1);
      change = {from: sel.from, to: sel.to, insert: Text.of([" "])};
    }
    if (change) {
      let startState = view.state;
      if (browser.ios && view.inputState.flushIOSKey(view))
        return true;
      if (browser.android && (change.from == sel.from && change.to == sel.to && change.insert.length == 1 && change.insert.lines == 2 && dispatchKey(view.contentDOM, "Enter", 13) || change.from == sel.from - 1 && change.to == sel.to && change.insert.length == 0 && dispatchKey(view.contentDOM, "Backspace", 8) || change.from == sel.from && change.to == sel.to + 1 && change.insert.length == 0 && dispatchKey(view.contentDOM, "Delete", 46)))
        return true;
      let text = change.insert.toString();
      if (view.state.facet(inputHandler).some((h) => h(view, change.from, change.to, text)))
        return true;
      if (view.inputState.composing >= 0)
        view.inputState.composing++;
      let tr;
      if (change.from >= sel.from && change.to <= sel.to && change.to - change.from >= (sel.to - sel.from) / 3 && (!newSel || newSel.main.empty && newSel.main.from == change.from + change.insert.length) && view.inputState.composing < 0) {
        let before = sel.from < change.from ? startState.sliceDoc(sel.from, change.from) : "";
        let after = sel.to > change.to ? startState.sliceDoc(change.to, sel.to) : "";
        tr = startState.replaceSelection(view.state.toText(before + change.insert.sliceString(0, void 0, view.state.lineBreak) + after));
      } else {
        let changes = startState.changes(change);
        let mainSel = newSel && !startState.selection.main.eq(newSel.main) && newSel.main.to <= changes.newLength ? newSel.main : void 0;
        if (startState.selection.ranges.length > 1 && view.inputState.composing >= 0 && change.to <= sel.to && change.to >= sel.to - 10) {
          let replaced = view.state.sliceDoc(change.from, change.to);
          let compositionRange = compositionSurroundingNode(view) || view.state.doc.lineAt(sel.head);
          let offset = sel.to - change.to, size = sel.to - sel.from;
          tr = startState.changeByRange((range) => {
            if (range.from == sel.from && range.to == sel.to)
              return {changes, range: mainSel || range.map(changes)};
            let to = range.to - offset, from = to - replaced.length;
            if (range.to - range.from != size || view.state.sliceDoc(from, to) != replaced || compositionRange && range.to >= compositionRange.from && range.from <= compositionRange.to)
              return {range};
            let rangeChanges = startState.changes({from, to, insert: change.insert}), selOff = range.to - sel.to;
            return {
              changes: rangeChanges,
              range: !mainSel ? range.map(rangeChanges) : EditorSelection.range(Math.max(0, mainSel.anchor + selOff), Math.max(0, mainSel.head + selOff))
            };
          });
        } else {
          tr = {
            changes,
            selection: mainSel && startState.selection.replaceRange(mainSel)
          };
        }
      }
      let userEvent = "input.type";
      if (view.composing) {
        userEvent += ".compose";
        if (view.inputState.compositionFirstChange) {
          userEvent += ".start";
          view.inputState.compositionFirstChange = false;
        }
      }
      view.dispatch(tr, {scrollIntoView: true, userEvent});
      return true;
    } else if (newSel && !newSel.main.eq(sel)) {
      let scrollIntoView3 = false, userEvent = "select";
      if (view.inputState.lastSelectionTime > Date.now() - 50) {
        if (view.inputState.lastSelectionOrigin == "select")
          scrollIntoView3 = true;
        userEvent = view.inputState.lastSelectionOrigin;
      }
      view.dispatch({selection: newSel, scrollIntoView: scrollIntoView3, userEvent});
      return true;
    } else {
      return false;
    }
  }
  function findDiff(a, b, preferredPos, preferredSide) {
    let minLen = Math.min(a.length, b.length);
    let from = 0;
    while (from < minLen && a.charCodeAt(from) == b.charCodeAt(from))
      from++;
    if (from == minLen && a.length == b.length)
      return null;
    let toA = a.length, toB = b.length;
    while (toA > 0 && toB > 0 && a.charCodeAt(toA - 1) == b.charCodeAt(toB - 1)) {
      toA--;
      toB--;
    }
    if (preferredSide == "end") {
      let adjust = Math.max(0, from - Math.min(toA, toB));
      preferredPos -= toA + adjust - from;
    }
    if (toA < from && a.length < b.length) {
      let move = preferredPos <= from && preferredPos >= toA ? from - preferredPos : 0;
      from -= move;
      toB = from + (toB - toA);
      toA = from;
    } else if (toB < from) {
      let move = preferredPos <= from && preferredPos >= toB ? from - preferredPos : 0;
      from -= move;
      toA = from + (toA - toB);
      toB = from;
    }
    return {from, toA, toB};
  }
  function selectionPoints(view) {
    let result = [];
    if (view.root.activeElement != view.contentDOM)
      return result;
    let {anchorNode, anchorOffset, focusNode, focusOffset} = view.observer.selectionRange;
    if (anchorNode) {
      result.push(new DOMPoint(anchorNode, anchorOffset));
      if (focusNode != anchorNode || focusOffset != anchorOffset)
        result.push(new DOMPoint(focusNode, focusOffset));
    }
    return result;
  }
  function selectionFromPoints(points, base2) {
    if (points.length == 0)
      return null;
    let anchor = points[0].pos, head = points.length == 2 ? points[1].pos : anchor;
    return anchor > -1 && head > -1 ? EditorSelection.single(anchor + base2, head + base2) : null;
  }
  var observeOptions = {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    characterDataOldValue: true
  };
  var useCharData = browser.ie && browser.ie_version <= 11;
  var DOMObserver = class {
    constructor(view) {
      this.view = view;
      this.active = false;
      this.selectionRange = new DOMSelectionState();
      this.selectionChanged = false;
      this.delayedFlush = -1;
      this.resizeTimeout = -1;
      this.queue = [];
      this.delayedAndroidKey = null;
      this.flushingAndroidKey = -1;
      this.lastChange = 0;
      this.scrollTargets = [];
      this.intersection = null;
      this.resize = null;
      this.intersecting = false;
      this.gapIntersection = null;
      this.gaps = [];
      this.parentCheck = -1;
      this.dom = view.contentDOM;
      this.observer = new MutationObserver((mutations) => {
        for (let mut of mutations)
          this.queue.push(mut);
        if ((browser.ie && browser.ie_version <= 11 || browser.ios && view.composing) && mutations.some((m) => m.type == "childList" && m.removedNodes.length || m.type == "characterData" && m.oldValue.length > m.target.nodeValue.length))
          this.flushSoon();
        else
          this.flush();
      });
      if (useCharData)
        this.onCharData = (event) => {
          this.queue.push({
            target: event.target,
            type: "characterData",
            oldValue: event.prevValue
          });
          this.flushSoon();
        };
      this.onSelectionChange = this.onSelectionChange.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onPrint = this.onPrint.bind(this);
      this.onScroll = this.onScroll.bind(this);
      if (typeof ResizeObserver == "function") {
        this.resize = new ResizeObserver(() => {
          var _a2;
          if (((_a2 = this.view.docView) === null || _a2 === void 0 ? void 0 : _a2.lastUpdate) < Date.now() - 75)
            this.onResize();
        });
        this.resize.observe(view.scrollDOM);
      }
      this.addWindowListeners(this.win = view.win);
      this.start();
      if (typeof IntersectionObserver == "function") {
        this.intersection = new IntersectionObserver((entries) => {
          if (this.parentCheck < 0)
            this.parentCheck = setTimeout(this.listenForScroll.bind(this), 1e3);
          if (entries.length > 0 && entries[entries.length - 1].intersectionRatio > 0 != this.intersecting) {
            this.intersecting = !this.intersecting;
            if (this.intersecting != this.view.inView)
              this.onScrollChanged(document.createEvent("Event"));
          }
        }, {});
        this.intersection.observe(this.dom);
        this.gapIntersection = new IntersectionObserver((entries) => {
          if (entries.length > 0 && entries[entries.length - 1].intersectionRatio > 0)
            this.onScrollChanged(document.createEvent("Event"));
        }, {});
      }
      this.listenForScroll();
      this.readSelectionRange();
    }
    onScrollChanged(e) {
      this.view.inputState.runScrollHandlers(this.view, e);
      if (this.intersecting)
        this.view.measure();
    }
    onScroll(e) {
      if (this.intersecting)
        this.flush(false);
      this.onScrollChanged(e);
    }
    onResize() {
      if (this.resizeTimeout < 0)
        this.resizeTimeout = setTimeout(() => {
          this.resizeTimeout = -1;
          this.view.requestMeasure();
        }, 50);
    }
    onPrint() {
      this.view.viewState.printing = true;
      this.view.measure();
      setTimeout(() => {
        this.view.viewState.printing = false;
        this.view.requestMeasure();
      }, 500);
    }
    updateGaps(gaps) {
      if (this.gapIntersection && (gaps.length != this.gaps.length || this.gaps.some((g, i) => g != gaps[i]))) {
        this.gapIntersection.disconnect();
        for (let gap of gaps)
          this.gapIntersection.observe(gap);
        this.gaps = gaps;
      }
    }
    onSelectionChange(event) {
      let wasChanged = this.selectionChanged;
      if (!this.readSelectionRange() || this.delayedAndroidKey)
        return;
      let {view} = this, sel = this.selectionRange;
      if (view.state.facet(editable) ? view.root.activeElement != this.dom : !hasSelection(view.dom, sel))
        return;
      let context = sel.anchorNode && view.docView.nearest(sel.anchorNode);
      if (context && context.ignoreEvent(event)) {
        if (!wasChanged)
          this.selectionChanged = false;
        return;
      }
      if ((browser.ie && browser.ie_version <= 11 || browser.android && browser.chrome) && !view.state.selection.main.empty && sel.focusNode && isEquivalentPosition(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset))
        this.flushSoon();
      else
        this.flush(false);
    }
    readSelectionRange() {
      let {view} = this;
      let range = browser.safari && view.root.nodeType == 11 && deepActiveElement(this.dom.ownerDocument) == this.dom && safariSelectionRangeHack(this.view) || getSelection(view.root);
      if (!range || this.selectionRange.eq(range))
        return false;
      let local = hasSelection(this.dom, range);
      if (local && !this.selectionChanged && view.inputState.lastFocusTime > Date.now() - 200 && view.inputState.lastTouchTime < Date.now() - 300 && atElementStart(this.dom, range)) {
        this.view.inputState.lastFocusTime = 0;
        view.docView.updateSelection();
        return false;
      }
      this.selectionRange.setRange(range);
      if (local)
        this.selectionChanged = true;
      return true;
    }
    setSelectionRange(anchor, head) {
      this.selectionRange.set(anchor.node, anchor.offset, head.node, head.offset);
      this.selectionChanged = false;
    }
    clearSelectionRange() {
      this.selectionRange.set(null, 0, null, 0);
    }
    listenForScroll() {
      this.parentCheck = -1;
      let i = 0, changed = null;
      for (let dom = this.dom; dom; ) {
        if (dom.nodeType == 1) {
          if (!changed && i < this.scrollTargets.length && this.scrollTargets[i] == dom)
            i++;
          else if (!changed)
            changed = this.scrollTargets.slice(0, i);
          if (changed)
            changed.push(dom);
          dom = dom.assignedSlot || dom.parentNode;
        } else if (dom.nodeType == 11) {
          dom = dom.host;
        } else {
          break;
        }
      }
      if (i < this.scrollTargets.length && !changed)
        changed = this.scrollTargets.slice(0, i);
      if (changed) {
        for (let dom of this.scrollTargets)
          dom.removeEventListener("scroll", this.onScroll);
        for (let dom of this.scrollTargets = changed)
          dom.addEventListener("scroll", this.onScroll);
      }
    }
    ignore(f) {
      if (!this.active)
        return f();
      try {
        this.stop();
        return f();
      } finally {
        this.start();
        this.clear();
      }
    }
    start() {
      if (this.active)
        return;
      this.observer.observe(this.dom, observeOptions);
      if (useCharData)
        this.dom.addEventListener("DOMCharacterDataModified", this.onCharData);
      this.active = true;
    }
    stop() {
      if (!this.active)
        return;
      this.active = false;
      this.observer.disconnect();
      if (useCharData)
        this.dom.removeEventListener("DOMCharacterDataModified", this.onCharData);
    }
    clear() {
      this.processRecords();
      this.queue.length = 0;
      this.selectionChanged = false;
    }
    delayAndroidKey(key, keyCode) {
      var _a2;
      if (!this.delayedAndroidKey) {
        let flush = () => {
          let key2 = this.delayedAndroidKey;
          if (key2) {
            this.clearDelayedAndroidKey();
            if (!this.flush() && key2.force)
              dispatchKey(this.dom, key2.key, key2.keyCode);
          }
        };
        this.flushingAndroidKey = this.view.win.requestAnimationFrame(flush);
      }
      if (!this.delayedAndroidKey || key == "Enter")
        this.delayedAndroidKey = {
          key,
          keyCode,
          force: this.lastChange < Date.now() - 50 || !!((_a2 = this.delayedAndroidKey) === null || _a2 === void 0 ? void 0 : _a2.force)
        };
    }
    clearDelayedAndroidKey() {
      this.win.cancelAnimationFrame(this.flushingAndroidKey);
      this.delayedAndroidKey = null;
      this.flushingAndroidKey = -1;
    }
    flushSoon() {
      if (this.delayedFlush < 0)
        this.delayedFlush = this.view.win.requestAnimationFrame(() => {
          this.delayedFlush = -1;
          this.flush();
        });
    }
    forceFlush() {
      if (this.delayedFlush >= 0) {
        this.view.win.cancelAnimationFrame(this.delayedFlush);
        this.delayedFlush = -1;
      }
      this.flush();
    }
    processRecords() {
      let records = this.queue;
      for (let mut of this.observer.takeRecords())
        records.push(mut);
      if (records.length)
        this.queue = [];
      let from = -1, to = -1, typeOver = false;
      for (let record of records) {
        let range = this.readMutation(record);
        if (!range)
          continue;
        if (range.typeOver)
          typeOver = true;
        if (from == -1) {
          ({from, to} = range);
        } else {
          from = Math.min(range.from, from);
          to = Math.max(range.to, to);
        }
      }
      return {from, to, typeOver};
    }
    readChange() {
      let {from, to, typeOver} = this.processRecords();
      let newSel = this.selectionChanged && hasSelection(this.dom, this.selectionRange);
      if (from < 0 && !newSel)
        return null;
      if (from > -1)
        this.lastChange = Date.now();
      this.view.inputState.lastFocusTime = 0;
      this.selectionChanged = false;
      return new DOMChange(this.view, from, to, typeOver);
    }
    flush(readSelection = true) {
      if (this.delayedFlush >= 0 || this.delayedAndroidKey)
        return false;
      if (readSelection)
        this.readSelectionRange();
      let domChange = this.readChange();
      if (!domChange)
        return false;
      let startState = this.view.state;
      let handled = applyDOMChange(this.view, domChange);
      if (this.view.state == startState)
        this.view.update([]);
      return handled;
    }
    readMutation(rec) {
      let cView = this.view.docView.nearest(rec.target);
      if (!cView || cView.ignoreMutation(rec))
        return null;
      cView.markDirty(rec.type == "attributes");
      if (rec.type == "attributes")
        cView.dirty |= 4;
      if (rec.type == "childList") {
        let childBefore = findChild(cView, rec.previousSibling || rec.target.previousSibling, -1);
        let childAfter = findChild(cView, rec.nextSibling || rec.target.nextSibling, 1);
        return {
          from: childBefore ? cView.posAfter(childBefore) : cView.posAtStart,
          to: childAfter ? cView.posBefore(childAfter) : cView.posAtEnd,
          typeOver: false
        };
      } else if (rec.type == "characterData") {
        return {from: cView.posAtStart, to: cView.posAtEnd, typeOver: rec.target.nodeValue == rec.oldValue};
      } else {
        return null;
      }
    }
    setWindow(win) {
      if (win != this.win) {
        this.removeWindowListeners(this.win);
        this.win = win;
        this.addWindowListeners(this.win);
      }
    }
    addWindowListeners(win) {
      win.addEventListener("resize", this.onResize);
      win.addEventListener("beforeprint", this.onPrint);
      win.addEventListener("scroll", this.onScroll);
      win.document.addEventListener("selectionchange", this.onSelectionChange);
    }
    removeWindowListeners(win) {
      win.removeEventListener("scroll", this.onScroll);
      win.removeEventListener("resize", this.onResize);
      win.removeEventListener("beforeprint", this.onPrint);
      win.document.removeEventListener("selectionchange", this.onSelectionChange);
    }
    destroy() {
      var _a2, _b, _c;
      this.stop();
      (_a2 = this.intersection) === null || _a2 === void 0 ? void 0 : _a2.disconnect();
      (_b = this.gapIntersection) === null || _b === void 0 ? void 0 : _b.disconnect();
      (_c = this.resize) === null || _c === void 0 ? void 0 : _c.disconnect();
      for (let dom of this.scrollTargets)
        dom.removeEventListener("scroll", this.onScroll);
      this.removeWindowListeners(this.win);
      clearTimeout(this.parentCheck);
      clearTimeout(this.resizeTimeout);
      this.win.cancelAnimationFrame(this.delayedFlush);
      this.win.cancelAnimationFrame(this.flushingAndroidKey);
    }
  };
  function findChild(cView, dom, dir) {
    while (dom) {
      let curView = ContentView.get(dom);
      if (curView && curView.parent == cView)
        return curView;
      let parent = dom.parentNode;
      dom = parent != cView.dom ? parent : dir > 0 ? dom.nextSibling : dom.previousSibling;
    }
    return null;
  }
  function safariSelectionRangeHack(view) {
    let found = null;
    function read(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      found = event.getTargetRanges()[0];
    }
    view.contentDOM.addEventListener("beforeinput", read, true);
    view.dom.ownerDocument.execCommand("indent");
    view.contentDOM.removeEventListener("beforeinput", read, true);
    if (!found)
      return null;
    let anchorNode = found.startContainer, anchorOffset = found.startOffset;
    let focusNode = found.endContainer, focusOffset = found.endOffset;
    let curAnchor = view.docView.domAtPos(view.state.selection.main.anchor);
    if (isEquivalentPosition(curAnchor.node, curAnchor.offset, focusNode, focusOffset))
      [anchorNode, anchorOffset, focusNode, focusOffset] = [focusNode, focusOffset, anchorNode, anchorOffset];
    return {anchorNode, anchorOffset, focusNode, focusOffset};
  }
  var EditorView = class {
    constructor(config = {}) {
      this.plugins = [];
      this.pluginMap = new Map();
      this.editorAttrs = {};
      this.contentAttrs = {};
      this.bidiCache = [];
      this.destroyed = false;
      this.updateState = 2;
      this.measureScheduled = -1;
      this.measureRequests = [];
      this.contentDOM = document.createElement("div");
      this.scrollDOM = document.createElement("div");
      this.scrollDOM.tabIndex = -1;
      this.scrollDOM.className = "cm-scroller";
      this.scrollDOM.appendChild(this.contentDOM);
      this.announceDOM = document.createElement("div");
      this.announceDOM.style.cssText = "position: absolute; top: -10000px";
      this.announceDOM.setAttribute("aria-live", "polite");
      this.dom = document.createElement("div");
      this.dom.appendChild(this.announceDOM);
      this.dom.appendChild(this.scrollDOM);
      this._dispatch = config.dispatch || ((tr) => this.update([tr]));
      this.dispatch = this.dispatch.bind(this);
      this._root = config.root || getRoot(config.parent) || document;
      this.viewState = new ViewState(config.state || EditorState.create(config));
      this.plugins = this.state.facet(viewPlugin).map((spec) => new PluginInstance(spec));
      for (let plugin of this.plugins)
        plugin.update(this);
      this.observer = new DOMObserver(this);
      this.inputState = new InputState(this);
      this.inputState.ensureHandlers(this, this.plugins);
      this.docView = new DocView(this);
      this.mountStyles();
      this.updateAttrs();
      this.updateState = 0;
      this.requestMeasure();
      if (config.parent)
        config.parent.appendChild(this.dom);
    }
    get state() {
      return this.viewState.state;
    }
    get viewport() {
      return this.viewState.viewport;
    }
    get visibleRanges() {
      return this.viewState.visibleRanges;
    }
    get inView() {
      return this.viewState.inView;
    }
    get composing() {
      return this.inputState.composing > 0;
    }
    get compositionStarted() {
      return this.inputState.composing >= 0;
    }
    get root() {
      return this._root;
    }
    get win() {
      return this.dom.ownerDocument.defaultView || window;
    }
    dispatch(...input) {
      this._dispatch(input.length == 1 && input[0] instanceof Transaction ? input[0] : this.state.update(...input));
    }
    update(transactions) {
      if (this.updateState != 0)
        throw new Error("Calls to EditorView.update are not allowed while an update is in progress");
      let redrawn = false, attrsChanged = false, update;
      let state = this.state;
      for (let tr of transactions) {
        if (tr.startState != state)
          throw new RangeError("Trying to update state with a transaction that doesn't start from the previous state.");
        state = tr.state;
      }
      if (this.destroyed) {
        this.viewState.state = state;
        return;
      }
      let pendingKey = this.observer.delayedAndroidKey, domChange = null;
      if (pendingKey) {
        this.observer.clearDelayedAndroidKey();
        domChange = this.observer.readChange();
        if (domChange && !this.state.doc.eq(state.doc) || !this.state.selection.eq(state.selection))
          domChange = null;
      } else {
        this.observer.clear();
      }
      if (state.facet(EditorState.phrases) != this.state.facet(EditorState.phrases))
        return this.setState(state);
      update = ViewUpdate.create(this, state, transactions);
      let scrollTarget = this.viewState.scrollTarget;
      try {
        this.updateState = 2;
        for (let tr of transactions) {
          if (scrollTarget)
            scrollTarget = scrollTarget.map(tr.changes);
          if (tr.scrollIntoView) {
            let {main} = tr.state.selection;
            scrollTarget = new ScrollTarget(main.empty ? main : EditorSelection.cursor(main.head, main.head > main.anchor ? -1 : 1));
          }
          for (let e of tr.effects)
            if (e.is(scrollIntoView))
              scrollTarget = e.value;
        }
        this.viewState.update(update, scrollTarget);
        this.bidiCache = CachedOrder.update(this.bidiCache, update.changes);
        if (!update.empty) {
          this.updatePlugins(update);
          this.inputState.update(update);
        }
        redrawn = this.docView.update(update);
        if (this.state.facet(styleModule) != this.styleModules)
          this.mountStyles();
        attrsChanged = this.updateAttrs();
        this.showAnnouncements(transactions);
        this.docView.updateSelection(redrawn, transactions.some((tr) => tr.isUserEvent("select.pointer")));
      } finally {
        this.updateState = 0;
      }
      if (update.startState.facet(theme) != update.state.facet(theme))
        this.viewState.mustMeasureContent = true;
      if (redrawn || attrsChanged || scrollTarget || this.viewState.mustEnforceCursorAssoc || this.viewState.mustMeasureContent)
        this.requestMeasure();
      if (!update.empty)
        for (let listener of this.state.facet(updateListener))
          listener(update);
      if (domChange) {
        if (!applyDOMChange(this, domChange) && pendingKey.force)
          dispatchKey(this.contentDOM, pendingKey.key, pendingKey.keyCode);
      }
    }
    setState(newState) {
      if (this.updateState != 0)
        throw new Error("Calls to EditorView.setState are not allowed while an update is in progress");
      if (this.destroyed) {
        this.viewState.state = newState;
        return;
      }
      this.updateState = 2;
      let hadFocus = this.hasFocus;
      try {
        for (let plugin of this.plugins)
          plugin.destroy(this);
        this.viewState = new ViewState(newState);
        this.plugins = newState.facet(viewPlugin).map((spec) => new PluginInstance(spec));
        this.pluginMap.clear();
        for (let plugin of this.plugins)
          plugin.update(this);
        this.docView = new DocView(this);
        this.inputState.ensureHandlers(this, this.plugins);
        this.mountStyles();
        this.updateAttrs();
        this.bidiCache = [];
      } finally {
        this.updateState = 0;
      }
      if (hadFocus)
        this.focus();
      this.requestMeasure();
    }
    updatePlugins(update) {
      let prevSpecs = update.startState.facet(viewPlugin), specs = update.state.facet(viewPlugin);
      if (prevSpecs != specs) {
        let newPlugins = [];
        for (let spec of specs) {
          let found = prevSpecs.indexOf(spec);
          if (found < 0) {
            newPlugins.push(new PluginInstance(spec));
          } else {
            let plugin = this.plugins[found];
            plugin.mustUpdate = update;
            newPlugins.push(plugin);
          }
        }
        for (let plugin of this.plugins)
          if (plugin.mustUpdate != update)
            plugin.destroy(this);
        this.plugins = newPlugins;
        this.pluginMap.clear();
        this.inputState.ensureHandlers(this, this.plugins);
      } else {
        for (let p of this.plugins)
          p.mustUpdate = update;
      }
      for (let i = 0; i < this.plugins.length; i++)
        this.plugins[i].update(this);
    }
    measure(flush = true) {
      if (this.destroyed)
        return;
      if (this.measureScheduled > -1)
        cancelAnimationFrame(this.measureScheduled);
      this.measureScheduled = 0;
      if (flush)
        this.observer.forceFlush();
      let updated = null;
      let {scrollHeight, scrollTop, clientHeight} = this.scrollDOM;
      let refHeight = scrollTop > scrollHeight - clientHeight - 4 ? scrollHeight : scrollTop;
      try {
        for (let i = 0; ; i++) {
          this.updateState = 1;
          let oldViewport = this.viewport;
          let refBlock = this.viewState.lineBlockAtHeight(refHeight);
          let changed = this.viewState.measure(this);
          if (!changed && !this.measureRequests.length && this.viewState.scrollTarget == null)
            break;
          if (i > 5) {
            console.warn(this.measureRequests.length ? "Measure loop restarted more than 5 times" : "Viewport failed to stabilize");
            break;
          }
          let measuring = [];
          if (!(changed & 4))
            [this.measureRequests, measuring] = [measuring, this.measureRequests];
          let measured = measuring.map((m) => {
            try {
              return m.read(this);
            } catch (e) {
              logException(this.state, e);
              return BadMeasure;
            }
          });
          let update = ViewUpdate.create(this, this.state, []), redrawn = false, scrolled = false;
          update.flags |= changed;
          if (!updated)
            updated = update;
          else
            updated.flags |= changed;
          this.updateState = 2;
          if (!update.empty) {
            this.updatePlugins(update);
            this.inputState.update(update);
            this.updateAttrs();
            redrawn = this.docView.update(update);
          }
          for (let i2 = 0; i2 < measuring.length; i2++)
            if (measured[i2] != BadMeasure) {
              try {
                let m = measuring[i2];
                if (m.write)
                  m.write(measured[i2], this);
              } catch (e) {
                logException(this.state, e);
              }
            }
          if (this.viewState.editorHeight) {
            if (this.viewState.scrollTarget) {
              this.docView.scrollIntoView(this.viewState.scrollTarget);
              this.viewState.scrollTarget = null;
              scrolled = true;
            } else {
              let diff = this.viewState.lineBlockAt(refBlock.from).top - refBlock.top;
              if (diff > 1 || diff < -1) {
                this.scrollDOM.scrollTop += diff;
                scrolled = true;
              }
            }
          }
          if (redrawn)
            this.docView.updateSelection(true);
          if (this.viewport.from == oldViewport.from && this.viewport.to == oldViewport.to && !scrolled && this.measureRequests.length == 0)
            break;
        }
      } finally {
        this.updateState = 0;
        this.measureScheduled = -1;
      }
      if (updated && !updated.empty)
        for (let listener of this.state.facet(updateListener))
          listener(updated);
    }
    get themeClasses() {
      return baseThemeID + " " + (this.state.facet(darkTheme) ? baseDarkID : baseLightID) + " " + this.state.facet(theme);
    }
    updateAttrs() {
      let editorAttrs = attrsFromFacet(this, editorAttributes, {
        class: "cm-editor" + (this.hasFocus ? " cm-focused " : " ") + this.themeClasses
      });
      let contentAttrs = {
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        translate: "no",
        contenteditable: !this.state.facet(editable) ? "false" : "true",
        class: "cm-content",
        style: `${browser.tabSize}: ${this.state.tabSize}`,
        role: "textbox",
        "aria-multiline": "true"
      };
      if (this.state.readOnly)
        contentAttrs["aria-readonly"] = "true";
      attrsFromFacet(this, contentAttributes, contentAttrs);
      let changed = this.observer.ignore(() => {
        let changedContent = updateAttrs(this.contentDOM, this.contentAttrs, contentAttrs);
        let changedEditor = updateAttrs(this.dom, this.editorAttrs, editorAttrs);
        return changedContent || changedEditor;
      });
      this.editorAttrs = editorAttrs;
      this.contentAttrs = contentAttrs;
      return changed;
    }
    showAnnouncements(trs) {
      let first = true;
      for (let tr of trs)
        for (let effect of tr.effects)
          if (effect.is(EditorView.announce)) {
            if (first)
              this.announceDOM.textContent = "";
            first = false;
            let div = this.announceDOM.appendChild(document.createElement("div"));
            div.textContent = effect.value;
          }
    }
    mountStyles() {
      this.styleModules = this.state.facet(styleModule);
      StyleModule.mount(this.root, this.styleModules.concat(baseTheme$1).reverse());
    }
    readMeasured() {
      if (this.updateState == 2)
        throw new Error("Reading the editor layout isn't allowed during an update");
      if (this.updateState == 0 && this.measureScheduled > -1)
        this.measure(false);
    }
    requestMeasure(request) {
      if (this.measureScheduled < 0)
        this.measureScheduled = this.win.requestAnimationFrame(() => this.measure());
      if (request) {
        if (request.key != null)
          for (let i = 0; i < this.measureRequests.length; i++) {
            if (this.measureRequests[i].key === request.key) {
              this.measureRequests[i] = request;
              return;
            }
          }
        this.measureRequests.push(request);
      }
    }
    plugin(plugin) {
      let known = this.pluginMap.get(plugin);
      if (known === void 0 || known && known.spec != plugin)
        this.pluginMap.set(plugin, known = this.plugins.find((p) => p.spec == plugin) || null);
      return known && known.update(this).value;
    }
    get documentTop() {
      return this.contentDOM.getBoundingClientRect().top + this.viewState.paddingTop;
    }
    get documentPadding() {
      return {top: this.viewState.paddingTop, bottom: this.viewState.paddingBottom};
    }
    elementAtHeight(height) {
      this.readMeasured();
      return this.viewState.elementAtHeight(height);
    }
    lineBlockAtHeight(height) {
      this.readMeasured();
      return this.viewState.lineBlockAtHeight(height);
    }
    get viewportLineBlocks() {
      return this.viewState.viewportLines;
    }
    lineBlockAt(pos) {
      return this.viewState.lineBlockAt(pos);
    }
    get contentHeight() {
      return this.viewState.contentHeight;
    }
    moveByChar(start, forward, by) {
      return skipAtoms(this, start, moveByChar(this, start, forward, by));
    }
    moveByGroup(start, forward) {
      return skipAtoms(this, start, moveByChar(this, start, forward, (initial) => byGroup(this, start.head, initial)));
    }
    moveToLineBoundary(start, forward, includeWrap = true) {
      return moveToLineBoundary(this, start, forward, includeWrap);
    }
    moveVertically(start, forward, distance) {
      return skipAtoms(this, start, moveVertically(this, start, forward, distance));
    }
    domAtPos(pos) {
      return this.docView.domAtPos(pos);
    }
    posAtDOM(node, offset = 0) {
      return this.docView.posFromDOM(node, offset);
    }
    posAtCoords(coords, precise = true) {
      this.readMeasured();
      return posAtCoords(this, coords, precise);
    }
    coordsAtPos(pos, side = 1) {
      this.readMeasured();
      let rect = this.docView.coordsAt(pos, side);
      if (!rect || rect.left == rect.right)
        return rect;
      let line = this.state.doc.lineAt(pos), order = this.bidiSpans(line);
      let span = order[BidiSpan.find(order, pos - line.from, -1, side)];
      return flattenRect(rect, span.dir == Direction.LTR == side > 0);
    }
    get defaultCharacterWidth() {
      return this.viewState.heightOracle.charWidth;
    }
    get defaultLineHeight() {
      return this.viewState.heightOracle.lineHeight;
    }
    get textDirection() {
      return this.viewState.defaultTextDirection;
    }
    textDirectionAt(pos) {
      let perLine = this.state.facet(perLineTextDirection);
      if (!perLine || pos < this.viewport.from || pos > this.viewport.to)
        return this.textDirection;
      this.readMeasured();
      return this.docView.textDirectionAt(pos);
    }
    get lineWrapping() {
      return this.viewState.heightOracle.lineWrapping;
    }
    bidiSpans(line) {
      if (line.length > MaxBidiLine)
        return trivialOrder(line.length);
      let dir = this.textDirectionAt(line.from);
      for (let entry of this.bidiCache)
        if (entry.from == line.from && entry.dir == dir)
          return entry.order;
      let order = computeOrder(line.text, dir);
      this.bidiCache.push(new CachedOrder(line.from, line.to, dir, order));
      return order;
    }
    get hasFocus() {
      var _a2;
      return (this.dom.ownerDocument.hasFocus() || browser.safari && ((_a2 = this.inputState) === null || _a2 === void 0 ? void 0 : _a2.lastContextMenu) > Date.now() - 3e4) && this.root.activeElement == this.contentDOM;
    }
    focus() {
      this.observer.ignore(() => {
        focusPreventScroll(this.contentDOM);
        this.docView.updateSelection();
      });
    }
    setRoot(root) {
      if (this._root != root) {
        this._root = root;
        this.observer.setWindow((root.nodeType == 9 ? root : root.ownerDocument).defaultView || window);
        this.mountStyles();
      }
    }
    destroy() {
      for (let plugin of this.plugins)
        plugin.destroy(this);
      this.plugins = [];
      this.inputState.destroy();
      this.dom.remove();
      this.observer.destroy();
      if (this.measureScheduled > -1)
        cancelAnimationFrame(this.measureScheduled);
      this.destroyed = true;
    }
    static scrollIntoView(pos, options = {}) {
      return scrollIntoView.of(new ScrollTarget(typeof pos == "number" ? EditorSelection.cursor(pos) : pos, options.y, options.x, options.yMargin, options.xMargin));
    }
    static domEventHandlers(handlers2) {
      return ViewPlugin.define(() => ({}), {eventHandlers: handlers2});
    }
    static theme(spec, options) {
      let prefix = StyleModule.newName();
      let result = [theme.of(prefix), styleModule.of(buildTheme(`.${prefix}`, spec))];
      if (options && options.dark)
        result.push(darkTheme.of(true));
      return result;
    }
    static baseTheme(spec) {
      return Prec.lowest(styleModule.of(buildTheme("." + baseThemeID, spec, lightDarkIDs)));
    }
    static findFromDOM(dom) {
      var _a2;
      let content2 = dom.querySelector(".cm-content");
      let cView = content2 && ContentView.get(content2) || ContentView.get(dom);
      return ((_a2 = cView === null || cView === void 0 ? void 0 : cView.rootView) === null || _a2 === void 0 ? void 0 : _a2.view) || null;
    }
  };
  EditorView.styleModule = styleModule;
  EditorView.inputHandler = inputHandler;
  EditorView.perLineTextDirection = perLineTextDirection;
  EditorView.exceptionSink = exceptionSink;
  EditorView.updateListener = updateListener;
  EditorView.editable = editable;
  EditorView.mouseSelectionStyle = mouseSelectionStyle;
  EditorView.dragMovesSelection = dragMovesSelection$1;
  EditorView.clickAddsSelectionRange = clickAddsSelectionRange;
  EditorView.decorations = decorations;
  EditorView.atomicRanges = atomicRanges;
  EditorView.scrollMargins = scrollMargins;
  EditorView.darkTheme = darkTheme;
  EditorView.contentAttributes = contentAttributes;
  EditorView.editorAttributes = editorAttributes;
  EditorView.lineWrapping = /* @__PURE__ */ EditorView.contentAttributes.of({class: "cm-lineWrapping"});
  EditorView.announce = /* @__PURE__ */ StateEffect.define();
  var MaxBidiLine = 4096;
  var BadMeasure = {};
  var CachedOrder = class {
    constructor(from, to, dir, order) {
      this.from = from;
      this.to = to;
      this.dir = dir;
      this.order = order;
    }
    static update(cache2, changes) {
      if (changes.empty)
        return cache2;
      let result = [], lastDir = cache2.length ? cache2[cache2.length - 1].dir : Direction.LTR;
      for (let i = Math.max(0, cache2.length - 10); i < cache2.length; i++) {
        let entry = cache2[i];
        if (entry.dir == lastDir && !changes.touchesRange(entry.from, entry.to))
          result.push(new CachedOrder(changes.mapPos(entry.from, 1), changes.mapPos(entry.to, -1), entry.dir, entry.order));
      }
      return result;
    }
  };
  function attrsFromFacet(view, facet, base2) {
    for (let sources = view.state.facet(facet), i = sources.length - 1; i >= 0; i--) {
      let source = sources[i], value = typeof source == "function" ? source(view) : source;
      if (value)
        combineAttrs(value, base2);
    }
    return base2;
  }
  var currentPlatform = browser.mac ? "mac" : browser.windows ? "win" : browser.linux ? "linux" : "key";
  function normalizeKeyName(name2, platform) {
    const parts = name2.split(/-(?!$)/);
    let result = parts[parts.length - 1];
    if (result == "Space")
      result = " ";
    let alt, ctrl, shift2, meta2;
    for (let i = 0; i < parts.length - 1; ++i) {
      const mod = parts[i];
      if (/^(cmd|meta|m)$/i.test(mod))
        meta2 = true;
      else if (/^a(lt)?$/i.test(mod))
        alt = true;
      else if (/^(c|ctrl|control)$/i.test(mod))
        ctrl = true;
      else if (/^s(hift)?$/i.test(mod))
        shift2 = true;
      else if (/^mod$/i.test(mod)) {
        if (platform == "mac")
          meta2 = true;
        else
          ctrl = true;
      } else
        throw new Error("Unrecognized modifier name: " + mod);
    }
    if (alt)
      result = "Alt-" + result;
    if (ctrl)
      result = "Ctrl-" + result;
    if (meta2)
      result = "Meta-" + result;
    if (shift2)
      result = "Shift-" + result;
    return result;
  }
  function modifiers(name2, event, shift2) {
    if (event.altKey)
      name2 = "Alt-" + name2;
    if (event.ctrlKey)
      name2 = "Ctrl-" + name2;
    if (event.metaKey)
      name2 = "Meta-" + name2;
    if (shift2 !== false && event.shiftKey)
      name2 = "Shift-" + name2;
    return name2;
  }
  var handleKeyEvents = /* @__PURE__ */ Prec.default(/* @__PURE__ */ EditorView.domEventHandlers({
    keydown(event, view) {
      return runHandlers(getKeymap(view.state), event, view, "editor");
    }
  }));
  var keymap = /* @__PURE__ */ Facet.define({enables: handleKeyEvents});
  var Keymaps = /* @__PURE__ */ new WeakMap();
  function getKeymap(state) {
    let bindings = state.facet(keymap);
    let map = Keymaps.get(bindings);
    if (!map)
      Keymaps.set(bindings, map = buildKeymap(bindings.reduce((a, b) => a.concat(b), [])));
    return map;
  }
  var storedPrefix = null;
  var PrefixTimeout = 4e3;
  function buildKeymap(bindings, platform = currentPlatform) {
    let bound = Object.create(null);
    let isPrefix = Object.create(null);
    let checkPrefix = (name2, is) => {
      let current = isPrefix[name2];
      if (current == null)
        isPrefix[name2] = is;
      else if (current != is)
        throw new Error("Key binding " + name2 + " is used both as a regular binding and as a multi-stroke prefix");
    };
    let add = (scope, key, command, preventDefault) => {
      var _a2, _b;
      let scopeObj = bound[scope] || (bound[scope] = Object.create(null));
      let parts = key.split(/ (?!$)/).map((k) => normalizeKeyName(k, platform));
      for (let i = 1; i < parts.length; i++) {
        let prefix = parts.slice(0, i).join(" ");
        checkPrefix(prefix, true);
        if (!scopeObj[prefix])
          scopeObj[prefix] = {
            preventDefault: true,
            run: [(view) => {
              let ourObj = storedPrefix = {view, prefix, scope};
              setTimeout(() => {
                if (storedPrefix == ourObj)
                  storedPrefix = null;
              }, PrefixTimeout);
              return true;
            }]
          };
      }
      let full = parts.join(" ");
      checkPrefix(full, false);
      let binding = scopeObj[full] || (scopeObj[full] = {preventDefault: false, run: ((_b = (_a2 = scopeObj._any) === null || _a2 === void 0 ? void 0 : _a2.run) === null || _b === void 0 ? void 0 : _b.slice()) || []});
      if (command)
        binding.run.push(command);
      if (preventDefault)
        binding.preventDefault = true;
    };
    for (let b of bindings) {
      let scopes = b.scope ? b.scope.split(" ") : ["editor"];
      if (b.any)
        for (let scope of scopes) {
          let scopeObj = bound[scope] || (bound[scope] = Object.create(null));
          if (!scopeObj._any)
            scopeObj._any = {preventDefault: false, run: []};
          for (let key in scopeObj)
            scopeObj[key].run.push(b.any);
        }
      let name2 = b[platform] || b.key;
      if (!name2)
        continue;
      for (let scope of scopes) {
        add(scope, name2, b.run, b.preventDefault);
        if (b.shift)
          add(scope, "Shift-" + name2, b.shift, b.preventDefault);
      }
    }
    return bound;
  }
  function runHandlers(map, event, view, scope) {
    let name2 = keyName(event);
    let charCode = codePointAt(name2, 0), isChar = codePointSize(charCode) == name2.length && name2 != " ";
    let prefix = "", fallthrough = false;
    if (storedPrefix && storedPrefix.view == view && storedPrefix.scope == scope) {
      prefix = storedPrefix.prefix + " ";
      if (fallthrough = modifierCodes.indexOf(event.keyCode) < 0)
        storedPrefix = null;
    }
    let ran = new Set();
    let runFor = (binding) => {
      if (binding) {
        for (let cmd of binding.run)
          if (!ran.has(cmd)) {
            ran.add(cmd);
            if (cmd(view, event))
              return true;
          }
        if (binding.preventDefault)
          fallthrough = true;
      }
      return false;
    };
    let scopeObj = map[scope], baseName, shiftName;
    if (scopeObj) {
      if (runFor(scopeObj[prefix + modifiers(name2, event, !isChar)]))
        return true;
      if (isChar && (event.altKey || event.metaKey || event.ctrlKey) && (baseName = base[event.keyCode]) && baseName != name2) {
        if (runFor(scopeObj[prefix + modifiers(baseName, event, true)]))
          return true;
        else if (event.shiftKey && (shiftName = shift[event.keyCode]) != name2 && shiftName != baseName && runFor(scopeObj[prefix + modifiers(shiftName, event, false)]))
          return true;
      } else if (isChar && event.shiftKey) {
        if (runFor(scopeObj[prefix + modifiers(name2, event, true)]))
          return true;
      }
      if (runFor(scopeObj._any))
        return true;
    }
    return fallthrough;
  }
  var CanHidePrimary = !browser.ios;
  var themeSpec = {
    ".cm-line": {
      "& ::selection": {backgroundColor: "transparent !important"},
      "&::selection": {backgroundColor: "transparent !important"}
    }
  };
  if (CanHidePrimary)
    themeSpec[".cm-line"].caretColor = "transparent !important";
  var UnicodeRegexpSupport = /x/.unicode != null ? "gu" : "g";
  var Outside = "-10000px";
  var TooltipViewManager = class {
    constructor(view, facet, createTooltipView) {
      this.facet = facet;
      this.createTooltipView = createTooltipView;
      this.input = view.state.facet(facet);
      this.tooltips = this.input.filter((t2) => t2);
      this.tooltipViews = this.tooltips.map(createTooltipView);
    }
    update(update) {
      var _a2;
      let input = update.state.facet(this.facet);
      let tooltips = input.filter((x) => x);
      if (input === this.input) {
        for (let t2 of this.tooltipViews)
          if (t2.update)
            t2.update(update);
        return false;
      }
      let tooltipViews = [];
      for (let i = 0; i < tooltips.length; i++) {
        let tip = tooltips[i], known = -1;
        if (!tip)
          continue;
        for (let i2 = 0; i2 < this.tooltips.length; i2++) {
          let other = this.tooltips[i2];
          if (other && other.create == tip.create)
            known = i2;
        }
        if (known < 0) {
          tooltipViews[i] = this.createTooltipView(tip);
        } else {
          let tooltipView = tooltipViews[i] = this.tooltipViews[known];
          if (tooltipView.update)
            tooltipView.update(update);
        }
      }
      for (let t2 of this.tooltipViews)
        if (tooltipViews.indexOf(t2) < 0) {
          t2.dom.remove();
          (_a2 = t2.destroy) === null || _a2 === void 0 ? void 0 : _a2.call(t2);
        }
      this.input = input;
      this.tooltips = tooltips;
      this.tooltipViews = tooltipViews;
      return true;
    }
  };
  function windowSpace(view) {
    let {win} = view;
    return {top: 0, left: 0, bottom: win.innerHeight, right: win.innerWidth};
  }
  var tooltipConfig = /* @__PURE__ */ Facet.define({
    combine: (values2) => {
      var _a2, _b, _c;
      return {
        position: browser.ios ? "absolute" : ((_a2 = values2.find((conf) => conf.position)) === null || _a2 === void 0 ? void 0 : _a2.position) || "fixed",
        parent: ((_b = values2.find((conf) => conf.parent)) === null || _b === void 0 ? void 0 : _b.parent) || null,
        tooltipSpace: ((_c = values2.find((conf) => conf.tooltipSpace)) === null || _c === void 0 ? void 0 : _c.tooltipSpace) || windowSpace
      };
    }
  });
  var tooltipPlugin = /* @__PURE__ */ ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.inView = true;
      this.lastTransaction = 0;
      this.measureTimeout = -1;
      let config = view.state.facet(tooltipConfig);
      this.position = config.position;
      this.parent = config.parent;
      this.classes = view.themeClasses;
      this.createContainer();
      this.measureReq = {read: this.readMeasure.bind(this), write: this.writeMeasure.bind(this), key: this};
      this.manager = new TooltipViewManager(view, showTooltip, (t2) => this.createTooltip(t2));
      this.intersectionObserver = typeof IntersectionObserver == "function" ? new IntersectionObserver((entries) => {
        if (Date.now() > this.lastTransaction - 50 && entries.length > 0 && entries[entries.length - 1].intersectionRatio < 1)
          this.measureSoon();
      }, {threshold: [1]}) : null;
      this.observeIntersection();
      view.win.addEventListener("resize", this.measureSoon = this.measureSoon.bind(this));
      this.maybeMeasure();
    }
    createContainer() {
      if (this.parent) {
        this.container = document.createElement("div");
        this.container.style.position = "relative";
        this.container.className = this.view.themeClasses;
        this.parent.appendChild(this.container);
      } else {
        this.container = this.view.dom;
      }
    }
    observeIntersection() {
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        for (let tooltip of this.manager.tooltipViews)
          this.intersectionObserver.observe(tooltip.dom);
      }
    }
    measureSoon() {
      if (this.measureTimeout < 0)
        this.measureTimeout = setTimeout(() => {
          this.measureTimeout = -1;
          this.maybeMeasure();
        }, 50);
    }
    update(update) {
      if (update.transactions.length)
        this.lastTransaction = Date.now();
      let updated = this.manager.update(update);
      if (updated)
        this.observeIntersection();
      let shouldMeasure = updated || update.geometryChanged;
      let newConfig = update.state.facet(tooltipConfig);
      if (newConfig.position != this.position) {
        this.position = newConfig.position;
        for (let t2 of this.manager.tooltipViews)
          t2.dom.style.position = this.position;
        shouldMeasure = true;
      }
      if (newConfig.parent != this.parent) {
        if (this.parent)
          this.container.remove();
        this.parent = newConfig.parent;
        this.createContainer();
        for (let t2 of this.manager.tooltipViews)
          this.container.appendChild(t2.dom);
        shouldMeasure = true;
      } else if (this.parent && this.view.themeClasses != this.classes) {
        this.classes = this.container.className = this.view.themeClasses;
      }
      if (shouldMeasure)
        this.maybeMeasure();
    }
    createTooltip(tooltip) {
      let tooltipView = tooltip.create(this.view);
      tooltipView.dom.classList.add("cm-tooltip");
      if (tooltip.arrow && !tooltipView.dom.querySelector(".cm-tooltip > .cm-tooltip-arrow")) {
        let arrow = document.createElement("div");
        arrow.className = "cm-tooltip-arrow";
        tooltipView.dom.appendChild(arrow);
      }
      tooltipView.dom.style.position = this.position;
      tooltipView.dom.style.top = Outside;
      this.container.appendChild(tooltipView.dom);
      if (tooltipView.mount)
        tooltipView.mount(this.view);
      return tooltipView;
    }
    destroy() {
      var _a2, _b;
      this.view.win.removeEventListener("resize", this.measureSoon);
      for (let tooltipView of this.manager.tooltipViews) {
        tooltipView.dom.remove();
        (_a2 = tooltipView.destroy) === null || _a2 === void 0 ? void 0 : _a2.call(tooltipView);
      }
      (_b = this.intersectionObserver) === null || _b === void 0 ? void 0 : _b.disconnect();
      clearTimeout(this.measureTimeout);
    }
    readMeasure() {
      let editor = this.view.dom.getBoundingClientRect();
      return {
        editor,
        parent: this.parent ? this.container.getBoundingClientRect() : editor,
        pos: this.manager.tooltips.map((t2, i) => {
          let tv = this.manager.tooltipViews[i];
          return tv.getCoords ? tv.getCoords(t2.pos) : this.view.coordsAtPos(t2.pos);
        }),
        size: this.manager.tooltipViews.map(({dom}) => dom.getBoundingClientRect()),
        space: this.view.state.facet(tooltipConfig).tooltipSpace(this.view)
      };
    }
    writeMeasure(measured) {
      let {editor, space: space4} = measured;
      let others = [];
      for (let i = 0; i < this.manager.tooltips.length; i++) {
        let tooltip = this.manager.tooltips[i], tView = this.manager.tooltipViews[i], {dom} = tView;
        let pos = measured.pos[i], size = measured.size[i];
        if (!pos || pos.bottom <= Math.max(editor.top, space4.top) || pos.top >= Math.min(editor.bottom, space4.bottom) || pos.right < Math.max(editor.left, space4.left) - 0.1 || pos.left > Math.min(editor.right, space4.right) + 0.1) {
          dom.style.top = Outside;
          continue;
        }
        let arrow = tooltip.arrow ? tView.dom.querySelector(".cm-tooltip-arrow") : null;
        let arrowHeight = arrow ? 7 : 0;
        let width = size.right - size.left, height = size.bottom - size.top;
        let offset = tView.offset || noOffset, ltr = this.view.textDirection == Direction.LTR;
        let left = size.width > space4.right - space4.left ? ltr ? space4.left : space4.right - size.width : ltr ? Math.min(pos.left - (arrow ? 14 : 0) + offset.x, space4.right - width) : Math.max(space4.left, pos.left - width + (arrow ? 14 : 0) - offset.x);
        let above = !!tooltip.above;
        if (!tooltip.strictSide && (above ? pos.top - (size.bottom - size.top) - offset.y < space4.top : pos.bottom + (size.bottom - size.top) + offset.y > space4.bottom) && above == space4.bottom - pos.bottom > pos.top - space4.top)
          above = !above;
        let top2 = above ? pos.top - height - arrowHeight - offset.y : pos.bottom + arrowHeight + offset.y;
        let right = left + width;
        if (tView.overlap !== true) {
          for (let r of others)
            if (r.left < right && r.right > left && r.top < top2 + height && r.bottom > top2)
              top2 = above ? r.top - height - 2 - arrowHeight : r.bottom + arrowHeight + 2;
        }
        if (this.position == "absolute") {
          dom.style.top = top2 - measured.parent.top + "px";
          dom.style.left = left - measured.parent.left + "px";
        } else {
          dom.style.top = top2 + "px";
          dom.style.left = left + "px";
        }
        if (arrow)
          arrow.style.left = `${pos.left + (ltr ? offset.x : -offset.x) - (left + 14 - 7)}px`;
        if (tView.overlap !== true)
          others.push({left, top: top2, right, bottom: top2 + height});
        dom.classList.toggle("cm-tooltip-above", above);
        dom.classList.toggle("cm-tooltip-below", !above);
        if (tView.positioned)
          tView.positioned(measured.space);
      }
    }
    maybeMeasure() {
      if (this.manager.tooltips.length) {
        if (this.view.inView)
          this.view.requestMeasure(this.measureReq);
        if (this.inView != this.view.inView) {
          this.inView = this.view.inView;
          if (!this.inView)
            for (let tv of this.manager.tooltipViews)
              tv.dom.style.top = Outside;
        }
      }
    }
  }, {
    eventHandlers: {
      scroll() {
        this.maybeMeasure();
      }
    }
  });
  var baseTheme = /* @__PURE__ */ EditorView.baseTheme({
    ".cm-tooltip": {
      zIndex: 100
    },
    "&light .cm-tooltip": {
      border: "1px solid #bbb",
      backgroundColor: "#f5f5f5"
    },
    "&light .cm-tooltip-section:not(:first-child)": {
      borderTop: "1px solid #bbb"
    },
    "&dark .cm-tooltip": {
      backgroundColor: "#333338",
      color: "white"
    },
    ".cm-tooltip-arrow": {
      height: `${7}px`,
      width: `${7 * 2}px`,
      position: "absolute",
      zIndex: -1,
      overflow: "hidden",
      "&:before, &:after": {
        content: "''",
        position: "absolute",
        width: 0,
        height: 0,
        borderLeft: `${7}px solid transparent`,
        borderRight: `${7}px solid transparent`
      },
      ".cm-tooltip-above &": {
        bottom: `-${7}px`,
        "&:before": {
          borderTop: `${7}px solid #bbb`
        },
        "&:after": {
          borderTop: `${7}px solid #f5f5f5`,
          bottom: "1px"
        }
      },
      ".cm-tooltip-below &": {
        top: `-${7}px`,
        "&:before": {
          borderBottom: `${7}px solid #bbb`
        },
        "&:after": {
          borderBottom: `${7}px solid #f5f5f5`,
          top: "1px"
        }
      }
    },
    "&dark .cm-tooltip .cm-tooltip-arrow": {
      "&:before": {
        borderTopColor: "#333338",
        borderBottomColor: "#333338"
      },
      "&:after": {
        borderTopColor: "transparent",
        borderBottomColor: "transparent"
      }
    }
  });
  var noOffset = {x: 0, y: 0};
  var showTooltip = /* @__PURE__ */ Facet.define({
    enables: [tooltipPlugin, baseTheme]
  });
  function getTooltip(view, tooltip) {
    let plugin = view.plugin(tooltipPlugin);
    if (!plugin)
      return null;
    let found = plugin.manager.tooltips.indexOf(tooltip);
    return found < 0 ? null : plugin.manager.tooltipViews[found];
  }
  var GutterMarker = class extends RangeValue {
    compare(other) {
      return this == other || this.constructor == other.constructor && this.eq(other);
    }
    eq(other) {
      return false;
    }
    destroy(dom) {
    }
  };
  GutterMarker.prototype.elementClass = "";
  GutterMarker.prototype.toDOM = void 0;
  GutterMarker.prototype.mapMode = MapMode.TrackBefore;
  GutterMarker.prototype.startSide = GutterMarker.prototype.endSide = -1;
  GutterMarker.prototype.point = true;
  var gutterLineClass = /* @__PURE__ */ Facet.define();
  var activeGutters = /* @__PURE__ */ Facet.define();
  var unfixGutters = /* @__PURE__ */ Facet.define({
    combine: (values2) => values2.some((x) => x)
  });
  function gutters(config) {
    let result = [
      gutterView
    ];
    if (config && config.fixed === false)
      result.push(unfixGutters.of(true));
    return result;
  }
  var gutterView = /* @__PURE__ */ ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.prevViewport = view.viewport;
      this.dom = document.createElement("div");
      this.dom.className = "cm-gutters";
      this.dom.setAttribute("aria-hidden", "true");
      this.dom.style.minHeight = this.view.contentHeight + "px";
      this.gutters = view.state.facet(activeGutters).map((conf) => new SingleGutterView(view, conf));
      for (let gutter2 of this.gutters)
        this.dom.appendChild(gutter2.dom);
      this.fixed = !view.state.facet(unfixGutters);
      if (this.fixed) {
        this.dom.style.position = "sticky";
      }
      this.syncGutters(false);
      view.scrollDOM.insertBefore(this.dom, view.contentDOM);
    }
    update(update) {
      if (this.updateGutters(update)) {
        let vpA = this.prevViewport, vpB = update.view.viewport;
        let vpOverlap = Math.min(vpA.to, vpB.to) - Math.max(vpA.from, vpB.from);
        this.syncGutters(vpOverlap < (vpB.to - vpB.from) * 0.8);
      }
      if (update.geometryChanged)
        this.dom.style.minHeight = this.view.contentHeight + "px";
      if (this.view.state.facet(unfixGutters) != !this.fixed) {
        this.fixed = !this.fixed;
        this.dom.style.position = this.fixed ? "sticky" : "";
      }
      this.prevViewport = update.view.viewport;
    }
    syncGutters(detach) {
      let after = this.dom.nextSibling;
      if (detach)
        this.dom.remove();
      let lineClasses = RangeSet.iter(this.view.state.facet(gutterLineClass), this.view.viewport.from);
      let classSet = [];
      let contexts = this.gutters.map((gutter2) => new UpdateContext(gutter2, this.view.viewport, -this.view.documentPadding.top));
      for (let line of this.view.viewportLineBlocks) {
        let text;
        if (Array.isArray(line.type)) {
          for (let b of line.type)
            if (b.type == BlockType.Text) {
              text = b;
              break;
            }
        } else {
          text = line.type == BlockType.Text ? line : void 0;
        }
        if (!text)
          continue;
        if (classSet.length)
          classSet = [];
        advanceCursor(lineClasses, classSet, line.from);
        for (let cx of contexts)
          cx.line(this.view, text, classSet);
      }
      for (let cx of contexts)
        cx.finish();
      if (detach)
        this.view.scrollDOM.insertBefore(this.dom, after);
    }
    updateGutters(update) {
      let prev = update.startState.facet(activeGutters), cur2 = update.state.facet(activeGutters);
      let change = update.docChanged || update.heightChanged || update.viewportChanged || !RangeSet.eq(update.startState.facet(gutterLineClass), update.state.facet(gutterLineClass), update.view.viewport.from, update.view.viewport.to);
      if (prev == cur2) {
        for (let gutter2 of this.gutters)
          if (gutter2.update(update))
            change = true;
      } else {
        change = true;
        let gutters2 = [];
        for (let conf of cur2) {
          let known = prev.indexOf(conf);
          if (known < 0) {
            gutters2.push(new SingleGutterView(this.view, conf));
          } else {
            this.gutters[known].update(update);
            gutters2.push(this.gutters[known]);
          }
        }
        for (let g of this.gutters) {
          g.dom.remove();
          if (gutters2.indexOf(g) < 0)
            g.destroy();
        }
        for (let g of gutters2)
          this.dom.appendChild(g.dom);
        this.gutters = gutters2;
      }
      return change;
    }
    destroy() {
      for (let view of this.gutters)
        view.destroy();
      this.dom.remove();
    }
  }, {
    provide: (plugin) => EditorView.scrollMargins.of((view) => {
      let value = view.plugin(plugin);
      if (!value || value.gutters.length == 0 || !value.fixed)
        return null;
      return view.textDirection == Direction.LTR ? {left: value.dom.offsetWidth} : {right: value.dom.offsetWidth};
    })
  });
  function asArray2(val) {
    return Array.isArray(val) ? val : [val];
  }
  function advanceCursor(cursor, collect, pos) {
    while (cursor.value && cursor.from <= pos) {
      if (cursor.from == pos)
        collect.push(cursor.value);
      cursor.next();
    }
  }
  var UpdateContext = class {
    constructor(gutter2, viewport, height) {
      this.gutter = gutter2;
      this.height = height;
      this.localMarkers = [];
      this.i = 0;
      this.cursor = RangeSet.iter(gutter2.markers, viewport.from);
    }
    line(view, line, extraMarkers) {
      if (this.localMarkers.length)
        this.localMarkers = [];
      advanceCursor(this.cursor, this.localMarkers, line.from);
      let localMarkers = extraMarkers.length ? this.localMarkers.concat(extraMarkers) : this.localMarkers;
      let forLine = this.gutter.config.lineMarker(view, line, localMarkers);
      if (forLine)
        localMarkers.unshift(forLine);
      let gutter2 = this.gutter;
      if (localMarkers.length == 0 && !gutter2.config.renderEmptyElements)
        return;
      let above = line.top - this.height;
      if (this.i == gutter2.elements.length) {
        let newElt = new GutterElement(view, line.height, above, localMarkers);
        gutter2.elements.push(newElt);
        gutter2.dom.appendChild(newElt.dom);
      } else {
        gutter2.elements[this.i].update(view, line.height, above, localMarkers);
      }
      this.height = line.bottom;
      this.i++;
    }
    finish() {
      let gutter2 = this.gutter;
      while (gutter2.elements.length > this.i) {
        let last = gutter2.elements.pop();
        gutter2.dom.removeChild(last.dom);
        last.destroy();
      }
    }
  };
  var SingleGutterView = class {
    constructor(view, config) {
      this.view = view;
      this.config = config;
      this.elements = [];
      this.spacer = null;
      this.dom = document.createElement("div");
      this.dom.className = "cm-gutter" + (this.config.class ? " " + this.config.class : "");
      for (let prop in config.domEventHandlers) {
        this.dom.addEventListener(prop, (event) => {
          let line = view.lineBlockAtHeight(event.clientY - view.documentTop);
          if (config.domEventHandlers[prop](view, line, event))
            event.preventDefault();
        });
      }
      this.markers = asArray2(config.markers(view));
      if (config.initialSpacer) {
        this.spacer = new GutterElement(view, 0, 0, [config.initialSpacer(view)]);
        this.dom.appendChild(this.spacer.dom);
        this.spacer.dom.style.cssText += "visibility: hidden; pointer-events: none";
      }
    }
    update(update) {
      let prevMarkers = this.markers;
      this.markers = asArray2(this.config.markers(update.view));
      if (this.spacer && this.config.updateSpacer) {
        let updated = this.config.updateSpacer(this.spacer.markers[0], update);
        if (updated != this.spacer.markers[0])
          this.spacer.update(update.view, 0, 0, [updated]);
      }
      let vp = update.view.viewport;
      return !RangeSet.eq(this.markers, prevMarkers, vp.from, vp.to) || (this.config.lineMarkerChange ? this.config.lineMarkerChange(update) : false);
    }
    destroy() {
      for (let elt2 of this.elements)
        elt2.destroy();
    }
  };
  var GutterElement = class {
    constructor(view, height, above, markers) {
      this.height = -1;
      this.above = 0;
      this.markers = [];
      this.dom = document.createElement("div");
      this.dom.className = "cm-gutterElement";
      this.update(view, height, above, markers);
    }
    update(view, height, above, markers) {
      if (this.height != height)
        this.dom.style.height = (this.height = height) + "px";
      if (this.above != above)
        this.dom.style.marginTop = (this.above = above) ? above + "px" : "";
      if (!sameMarkers(this.markers, markers))
        this.setMarkers(view, markers);
    }
    setMarkers(view, markers) {
      let cls = "cm-gutterElement", domPos = this.dom.firstChild;
      for (let iNew = 0, iOld = 0; ; ) {
        let skipTo = iOld, marker = iNew < markers.length ? markers[iNew++] : null, matched = false;
        if (marker) {
          let c = marker.elementClass;
          if (c)
            cls += " " + c;
          for (let i = iOld; i < this.markers.length; i++)
            if (this.markers[i].compare(marker)) {
              skipTo = i;
              matched = true;
              break;
            }
        } else {
          skipTo = this.markers.length;
        }
        while (iOld < skipTo) {
          let next = this.markers[iOld++];
          if (next.toDOM) {
            next.destroy(domPos);
            let after = domPos.nextSibling;
            domPos.remove();
            domPos = after;
          }
        }
        if (!marker)
          break;
        if (marker.toDOM) {
          if (matched)
            domPos = domPos.nextSibling;
          else
            this.dom.insertBefore(marker.toDOM(view), domPos);
        }
        if (matched)
          iOld++;
      }
      this.dom.className = cls;
      this.markers = markers;
    }
    destroy() {
      this.setMarkers(null, []);
    }
  };
  function sameMarkers(a, b) {
    if (a.length != b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (!a[i].compare(b[i]))
        return false;
    return true;
  }
  var lineNumberMarkers = /* @__PURE__ */ Facet.define();
  var lineNumberConfig = /* @__PURE__ */ Facet.define({
    combine(values2) {
      return combineConfig(values2, {formatNumber: String, domEventHandlers: {}}, {
        domEventHandlers(a, b) {
          let result = Object.assign({}, a);
          for (let event in b) {
            let exists = result[event], add = b[event];
            result[event] = exists ? (view, line, event2) => exists(view, line, event2) || add(view, line, event2) : add;
          }
          return result;
        }
      });
    }
  });
  var NumberMarker = class extends GutterMarker {
    constructor(number2) {
      super();
      this.number = number2;
    }
    eq(other) {
      return this.number == other.number;
    }
    toDOM() {
      return document.createTextNode(this.number);
    }
  };
  function formatNumber(view, number2) {
    return view.state.facet(lineNumberConfig).formatNumber(number2, view.state);
  }
  var lineNumberGutter = /* @__PURE__ */ activeGutters.compute([lineNumberConfig], (state) => ({
    class: "cm-lineNumbers",
    renderEmptyElements: false,
    markers(view) {
      return view.state.facet(lineNumberMarkers);
    },
    lineMarker(view, line, others) {
      if (others.some((m) => m.toDOM))
        return null;
      return new NumberMarker(formatNumber(view, view.state.doc.lineAt(line.from).number));
    },
    lineMarkerChange: (update) => update.startState.facet(lineNumberConfig) != update.state.facet(lineNumberConfig),
    initialSpacer(view) {
      return new NumberMarker(formatNumber(view, maxLineNumber(view.state.doc.lines)));
    },
    updateSpacer(spacer, update) {
      let max = formatNumber(update.view, maxLineNumber(update.view.state.doc.lines));
      return max == spacer.number ? spacer : new NumberMarker(max);
    },
    domEventHandlers: state.facet(lineNumberConfig).domEventHandlers
  }));
  function lineNumbers(config = {}) {
    return [
      lineNumberConfig.of(config),
      gutters(),
      lineNumberGutter
    ];
  }
  function maxLineNumber(lines) {
    let last = 9;
    while (last < lines)
      last = last * 10 + 9;
    return last;
  }

  // node_modules/@lezer/common/dist/index.js
  var DefaultBufferLength = 1024;
  var nextPropID = 0;
  var Range2 = class {
    constructor(from, to) {
      this.from = from;
      this.to = to;
    }
  };
  var NodeProp = class {
    constructor(config = {}) {
      this.id = nextPropID++;
      this.perNode = !!config.perNode;
      this.deserialize = config.deserialize || (() => {
        throw new Error("This node type doesn't define a deserialize function");
      });
    }
    add(match) {
      if (this.perNode)
        throw new RangeError("Can't add per-node props to node types");
      if (typeof match != "function")
        match = NodeType.match(match);
      return (type) => {
        let result = match(type);
        return result === void 0 ? null : [this, result];
      };
    }
  };
  NodeProp.closedBy = new NodeProp({deserialize: (str) => str.split(" ")});
  NodeProp.openedBy = new NodeProp({deserialize: (str) => str.split(" ")});
  NodeProp.group = new NodeProp({deserialize: (str) => str.split(" ")});
  NodeProp.contextHash = new NodeProp({perNode: true});
  NodeProp.lookAhead = new NodeProp({perNode: true});
  NodeProp.mounted = new NodeProp({perNode: true});
  var MountedTree = class {
    constructor(tree, overlay, parser7) {
      this.tree = tree;
      this.overlay = overlay;
      this.parser = parser7;
    }
  };
  var noProps = Object.create(null);
  var NodeType = class {
    constructor(name2, props, id2, flags = 0) {
      this.name = name2;
      this.props = props;
      this.id = id2;
      this.flags = flags;
    }
    static define(spec) {
      let props = spec.props && spec.props.length ? Object.create(null) : noProps;
      let flags = (spec.top ? 1 : 0) | (spec.skipped ? 2 : 0) | (spec.error ? 4 : 0) | (spec.name == null ? 8 : 0);
      let type = new NodeType(spec.name || "", props, spec.id, flags);
      if (spec.props)
        for (let src of spec.props) {
          if (!Array.isArray(src))
            src = src(type);
          if (src) {
            if (src[0].perNode)
              throw new RangeError("Can't store a per-node prop on a node type");
            props[src[0].id] = src[1];
          }
        }
      return type;
    }
    prop(prop) {
      return this.props[prop.id];
    }
    get isTop() {
      return (this.flags & 1) > 0;
    }
    get isSkipped() {
      return (this.flags & 2) > 0;
    }
    get isError() {
      return (this.flags & 4) > 0;
    }
    get isAnonymous() {
      return (this.flags & 8) > 0;
    }
    is(name2) {
      if (typeof name2 == "string") {
        if (this.name == name2)
          return true;
        let group = this.prop(NodeProp.group);
        return group ? group.indexOf(name2) > -1 : false;
      }
      return this.id == name2;
    }
    static match(map) {
      let direct = Object.create(null);
      for (let prop in map)
        for (let name2 of prop.split(" "))
          direct[name2] = map[prop];
      return (node) => {
        for (let groups = node.prop(NodeProp.group), i = -1; i < (groups ? groups.length : 0); i++) {
          let found = direct[i < 0 ? node.name : groups[i]];
          if (found)
            return found;
        }
      };
    }
  };
  NodeType.none = new NodeType("", Object.create(null), 0, 8);
  var NodeSet = class {
    constructor(types2) {
      this.types = types2;
      for (let i = 0; i < types2.length; i++)
        if (types2[i].id != i)
          throw new RangeError("Node type ids should correspond to array positions when creating a node set");
    }
    extend(...props) {
      let newTypes = [];
      for (let type of this.types) {
        let newProps = null;
        for (let source of props) {
          let add = source(type);
          if (add) {
            if (!newProps)
              newProps = Object.assign({}, type.props);
            newProps[add[0].id] = add[1];
          }
        }
        newTypes.push(newProps ? new NodeType(type.name, newProps, type.id, type.flags) : type);
      }
      return new NodeSet(newTypes);
    }
  };
  var CachedNode = new WeakMap();
  var CachedInnerNode = new WeakMap();
  var IterMode;
  (function(IterMode2) {
    IterMode2[IterMode2["ExcludeBuffers"] = 1] = "ExcludeBuffers";
    IterMode2[IterMode2["IncludeAnonymous"] = 2] = "IncludeAnonymous";
    IterMode2[IterMode2["IgnoreMounts"] = 4] = "IgnoreMounts";
    IterMode2[IterMode2["IgnoreOverlays"] = 8] = "IgnoreOverlays";
  })(IterMode || (IterMode = {}));
  var Tree = class {
    constructor(type, children, positions, length, props) {
      this.type = type;
      this.children = children;
      this.positions = positions;
      this.length = length;
      this.props = null;
      if (props && props.length) {
        this.props = Object.create(null);
        for (let [prop, value] of props)
          this.props[typeof prop == "number" ? prop : prop.id] = value;
      }
    }
    toString() {
      let mounted = this.prop(NodeProp.mounted);
      if (mounted && !mounted.overlay)
        return mounted.tree.toString();
      let children = "";
      for (let ch of this.children) {
        let str = ch.toString();
        if (str) {
          if (children)
            children += ",";
          children += str;
        }
      }
      return !this.type.name ? children : (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) + (children.length ? "(" + children + ")" : "");
    }
    cursor(mode = 0) {
      return new TreeCursor(this.topNode, mode);
    }
    cursorAt(pos, side = 0, mode = 0) {
      let scope = CachedNode.get(this) || this.topNode;
      let cursor = new TreeCursor(scope);
      cursor.moveTo(pos, side);
      CachedNode.set(this, cursor._tree);
      return cursor;
    }
    get topNode() {
      return new TreeNode(this, 0, 0, null);
    }
    resolve(pos, side = 0) {
      let node = resolveNode(CachedNode.get(this) || this.topNode, pos, side, false);
      CachedNode.set(this, node);
      return node;
    }
    resolveInner(pos, side = 0) {
      let node = resolveNode(CachedInnerNode.get(this) || this.topNode, pos, side, true);
      CachedInnerNode.set(this, node);
      return node;
    }
    iterate(spec) {
      let {enter, leave, from = 0, to = this.length} = spec;
      for (let c = this.cursor((spec.mode || 0) | IterMode.IncludeAnonymous); ; ) {
        let entered = false;
        if (c.from <= to && c.to >= from && (c.type.isAnonymous || enter(c) !== false)) {
          if (c.firstChild())
            continue;
          entered = true;
        }
        for (; ; ) {
          if (entered && leave && !c.type.isAnonymous)
            leave(c);
          if (c.nextSibling())
            break;
          if (!c.parent())
            return;
          entered = true;
        }
      }
    }
    prop(prop) {
      return !prop.perNode ? this.type.prop(prop) : this.props ? this.props[prop.id] : void 0;
    }
    get propValues() {
      let result = [];
      if (this.props)
        for (let id2 in this.props)
          result.push([+id2, this.props[id2]]);
      return result;
    }
    balance(config = {}) {
      return this.children.length <= 8 ? this : balanceRange(NodeType.none, this.children, this.positions, 0, this.children.length, 0, this.length, (children, positions, length) => new Tree(this.type, children, positions, length, this.propValues), config.makeTree || ((children, positions, length) => new Tree(NodeType.none, children, positions, length)));
    }
    static build(data2) {
      return buildTree(data2);
    }
  };
  Tree.empty = new Tree(NodeType.none, [], [], 0);
  var FlatBufferCursor = class {
    constructor(buffer, index) {
      this.buffer = buffer;
      this.index = index;
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    get pos() {
      return this.index;
    }
    next() {
      this.index -= 4;
    }
    fork() {
      return new FlatBufferCursor(this.buffer, this.index);
    }
  };
  var TreeBuffer = class {
    constructor(buffer, length, set) {
      this.buffer = buffer;
      this.length = length;
      this.set = set;
    }
    get type() {
      return NodeType.none;
    }
    toString() {
      let result = [];
      for (let index = 0; index < this.buffer.length; ) {
        result.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result.join(",");
    }
    childString(index) {
      let id2 = this.buffer[index], endIndex = this.buffer[index + 3];
      let type = this.set.types[id2], result = type.name;
      if (/\W/.test(result) && !type.isError)
        result = JSON.stringify(result);
      index += 4;
      if (endIndex == index)
        return result;
      let children = [];
      while (index < endIndex) {
        children.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result + "(" + children.join(",") + ")";
    }
    findChild(startIndex, endIndex, dir, pos, side) {
      let {buffer} = this, pick = -1;
      for (let i = startIndex; i != endIndex; i = buffer[i + 3]) {
        if (checkSide(side, pos, buffer[i + 1], buffer[i + 2])) {
          pick = i;
          if (dir > 0)
            break;
        }
      }
      return pick;
    }
    slice(startI, endI, from, to) {
      let b = this.buffer;
      let copy = new Uint16Array(endI - startI);
      for (let i = startI, j = 0; i < endI; ) {
        copy[j++] = b[i++];
        copy[j++] = b[i++] - from;
        copy[j++] = b[i++] - from;
        copy[j++] = b[i++] - startI;
      }
      return new TreeBuffer(copy, to - from, this.set);
    }
  };
  function checkSide(side, pos, from, to) {
    switch (side) {
      case -2:
        return from < pos;
      case -1:
        return to >= pos && from < pos;
      case 0:
        return from < pos && to > pos;
      case 1:
        return from <= pos && to > pos;
      case 2:
        return to > pos;
      case 4:
        return true;
    }
  }
  function enterUnfinishedNodesBefore(node, pos) {
    let scan = node.childBefore(pos);
    while (scan) {
      let last = scan.lastChild;
      if (!last || last.to != scan.to)
        break;
      if (last.type.isError && last.from == last.to) {
        node = scan;
        scan = last.prevSibling;
      } else {
        scan = last;
      }
    }
    return node;
  }
  function resolveNode(node, pos, side, overlays) {
    var _a2;
    while (node.from == node.to || (side < 1 ? node.from >= pos : node.from > pos) || (side > -1 ? node.to <= pos : node.to < pos)) {
      let parent = !overlays && node instanceof TreeNode && node.index < 0 ? null : node.parent;
      if (!parent)
        return node;
      node = parent;
    }
    let mode = overlays ? 0 : IterMode.IgnoreOverlays;
    if (overlays)
      for (let scan = node, parent = scan.parent; parent; scan = parent, parent = scan.parent) {
        if (scan instanceof TreeNode && scan.index < 0 && ((_a2 = parent.enter(pos, side, mode)) === null || _a2 === void 0 ? void 0 : _a2.from) != scan.from)
          node = parent;
      }
    for (; ; ) {
      let inner = node.enter(pos, side, mode);
      if (!inner)
        return node;
      node = inner;
    }
  }
  var TreeNode = class {
    constructor(_tree, from, index, _parent) {
      this._tree = _tree;
      this.from = from;
      this.index = index;
      this._parent = _parent;
    }
    get type() {
      return this._tree.type;
    }
    get name() {
      return this._tree.type.name;
    }
    get to() {
      return this.from + this._tree.length;
    }
    nextChild(i, dir, pos, side, mode = 0) {
      for (let parent = this; ; ) {
        for (let {children, positions} = parent._tree, e = dir > 0 ? children.length : -1; i != e; i += dir) {
          let next = children[i], start = positions[i] + parent.from;
          if (!checkSide(side, pos, start, start + next.length))
            continue;
          if (next instanceof TreeBuffer) {
            if (mode & IterMode.ExcludeBuffers)
              continue;
            let index = next.findChild(0, next.buffer.length, dir, pos - start, side);
            if (index > -1)
              return new BufferNode(new BufferContext(parent, next, i, start), null, index);
          } else if (mode & IterMode.IncludeAnonymous || (!next.type.isAnonymous || hasChild(next))) {
            let mounted;
            if (!(mode & IterMode.IgnoreMounts) && next.props && (mounted = next.prop(NodeProp.mounted)) && !mounted.overlay)
              return new TreeNode(mounted.tree, start, i, parent);
            let inner = new TreeNode(next, start, i, parent);
            return mode & IterMode.IncludeAnonymous || !inner.type.isAnonymous ? inner : inner.nextChild(dir < 0 ? next.children.length - 1 : 0, dir, pos, side);
          }
        }
        if (mode & IterMode.IncludeAnonymous || !parent.type.isAnonymous)
          return null;
        if (parent.index >= 0)
          i = parent.index + dir;
        else
          i = dir < 0 ? -1 : parent._parent._tree.children.length;
        parent = parent._parent;
        if (!parent)
          return null;
      }
    }
    get firstChild() {
      return this.nextChild(0, 1, 0, 4);
    }
    get lastChild() {
      return this.nextChild(this._tree.children.length - 1, -1, 0, 4);
    }
    childAfter(pos) {
      return this.nextChild(0, 1, pos, 2);
    }
    childBefore(pos) {
      return this.nextChild(this._tree.children.length - 1, -1, pos, -2);
    }
    enter(pos, side, mode = 0) {
      let mounted;
      if (!(mode & IterMode.IgnoreOverlays) && (mounted = this._tree.prop(NodeProp.mounted)) && mounted.overlay) {
        let rPos = pos - this.from;
        for (let {from, to} of mounted.overlay) {
          if ((side > 0 ? from <= rPos : from < rPos) && (side < 0 ? to >= rPos : to > rPos))
            return new TreeNode(mounted.tree, mounted.overlay[0].from + this.from, -1, this);
        }
      }
      return this.nextChild(0, 1, pos, side, mode);
    }
    nextSignificantParent() {
      let val = this;
      while (val.type.isAnonymous && val._parent)
        val = val._parent;
      return val;
    }
    get parent() {
      return this._parent ? this._parent.nextSignificantParent() : null;
    }
    get nextSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(this.index + 1, 1, 0, 4) : null;
    }
    get prevSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(this.index - 1, -1, 0, 4) : null;
    }
    cursor(mode = 0) {
      return new TreeCursor(this, mode);
    }
    get tree() {
      return this._tree;
    }
    toTree() {
      return this._tree;
    }
    resolve(pos, side = 0) {
      return resolveNode(this, pos, side, false);
    }
    resolveInner(pos, side = 0) {
      return resolveNode(this, pos, side, true);
    }
    enterUnfinishedNodesBefore(pos) {
      return enterUnfinishedNodesBefore(this, pos);
    }
    getChild(type, before = null, after = null) {
      let r = getChildren(this, type, before, after);
      return r.length ? r[0] : null;
    }
    getChildren(type, before = null, after = null) {
      return getChildren(this, type, before, after);
    }
    toString() {
      return this._tree.toString();
    }
    get node() {
      return this;
    }
    matchContext(context) {
      return matchNodeContext(this, context);
    }
  };
  function getChildren(node, type, before, after) {
    let cur2 = node.cursor(), result = [];
    if (!cur2.firstChild())
      return result;
    if (before != null) {
      while (!cur2.type.is(before))
        if (!cur2.nextSibling())
          return result;
    }
    for (; ; ) {
      if (after != null && cur2.type.is(after))
        return result;
      if (cur2.type.is(type))
        result.push(cur2.node);
      if (!cur2.nextSibling())
        return after == null ? result : [];
    }
  }
  function matchNodeContext(node, context, i = context.length - 1) {
    for (let p = node.parent; i >= 0; p = p.parent) {
      if (!p)
        return false;
      if (!p.type.isAnonymous) {
        if (context[i] && context[i] != p.name)
          return false;
        i--;
      }
    }
    return true;
  }
  var BufferContext = class {
    constructor(parent, buffer, index, start) {
      this.parent = parent;
      this.buffer = buffer;
      this.index = index;
      this.start = start;
    }
  };
  var BufferNode = class {
    constructor(context, _parent, index) {
      this.context = context;
      this._parent = _parent;
      this.index = index;
      this.type = context.buffer.set.types[context.buffer.buffer[index]];
    }
    get name() {
      return this.type.name;
    }
    get from() {
      return this.context.start + this.context.buffer.buffer[this.index + 1];
    }
    get to() {
      return this.context.start + this.context.buffer.buffer[this.index + 2];
    }
    child(dir, pos, side) {
      let {buffer} = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.context.start, side);
      return index < 0 ? null : new BufferNode(this.context, this, index);
    }
    get firstChild() {
      return this.child(1, 0, 4);
    }
    get lastChild() {
      return this.child(-1, 0, 4);
    }
    childAfter(pos) {
      return this.child(1, pos, 2);
    }
    childBefore(pos) {
      return this.child(-1, pos, -2);
    }
    enter(pos, side, mode = 0) {
      if (mode & IterMode.ExcludeBuffers)
        return null;
      let {buffer} = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], side > 0 ? 1 : -1, pos - this.context.start, side);
      return index < 0 ? null : new BufferNode(this.context, this, index);
    }
    get parent() {
      return this._parent || this.context.parent.nextSignificantParent();
    }
    externalSibling(dir) {
      return this._parent ? null : this.context.parent.nextChild(this.context.index + dir, dir, 0, 4);
    }
    get nextSibling() {
      let {buffer} = this.context;
      let after = buffer.buffer[this.index + 3];
      if (after < (this._parent ? buffer.buffer[this._parent.index + 3] : buffer.buffer.length))
        return new BufferNode(this.context, this._parent, after);
      return this.externalSibling(1);
    }
    get prevSibling() {
      let {buffer} = this.context;
      let parentStart = this._parent ? this._parent.index + 4 : 0;
      if (this.index == parentStart)
        return this.externalSibling(-1);
      return new BufferNode(this.context, this._parent, buffer.findChild(parentStart, this.index, -1, 0, 4));
    }
    cursor(mode = 0) {
      return new TreeCursor(this, mode);
    }
    get tree() {
      return null;
    }
    toTree() {
      let children = [], positions = [];
      let {buffer} = this.context;
      let startI = this.index + 4, endI = buffer.buffer[this.index + 3];
      if (endI > startI) {
        let from = buffer.buffer[this.index + 1], to = buffer.buffer[this.index + 2];
        children.push(buffer.slice(startI, endI, from, to));
        positions.push(0);
      }
      return new Tree(this.type, children, positions, this.to - this.from);
    }
    resolve(pos, side = 0) {
      return resolveNode(this, pos, side, false);
    }
    resolveInner(pos, side = 0) {
      return resolveNode(this, pos, side, true);
    }
    enterUnfinishedNodesBefore(pos) {
      return enterUnfinishedNodesBefore(this, pos);
    }
    toString() {
      return this.context.buffer.childString(this.index);
    }
    getChild(type, before = null, after = null) {
      let r = getChildren(this, type, before, after);
      return r.length ? r[0] : null;
    }
    getChildren(type, before = null, after = null) {
      return getChildren(this, type, before, after);
    }
    get node() {
      return this;
    }
    matchContext(context) {
      return matchNodeContext(this, context);
    }
  };
  var TreeCursor = class {
    constructor(node, mode = 0) {
      this.mode = mode;
      this.buffer = null;
      this.stack = [];
      this.index = 0;
      this.bufferNode = null;
      if (node instanceof TreeNode) {
        this.yieldNode(node);
      } else {
        this._tree = node.context.parent;
        this.buffer = node.context;
        for (let n = node._parent; n; n = n._parent)
          this.stack.unshift(n.index);
        this.bufferNode = node;
        this.yieldBuf(node.index);
      }
    }
    get name() {
      return this.type.name;
    }
    yieldNode(node) {
      if (!node)
        return false;
      this._tree = node;
      this.type = node.type;
      this.from = node.from;
      this.to = node.to;
      return true;
    }
    yieldBuf(index, type) {
      this.index = index;
      let {start, buffer} = this.buffer;
      this.type = type || buffer.set.types[buffer.buffer[index]];
      this.from = start + buffer.buffer[index + 1];
      this.to = start + buffer.buffer[index + 2];
      return true;
    }
    yield(node) {
      if (!node)
        return false;
      if (node instanceof TreeNode) {
        this.buffer = null;
        return this.yieldNode(node);
      }
      this.buffer = node.context;
      return this.yieldBuf(node.index, node.type);
    }
    toString() {
      return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
    }
    enterChild(dir, pos, side) {
      if (!this.buffer)
        return this.yield(this._tree.nextChild(dir < 0 ? this._tree._tree.children.length - 1 : 0, dir, pos, side, this.mode));
      let {buffer} = this.buffer;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.buffer.start, side);
      if (index < 0)
        return false;
      this.stack.push(this.index);
      return this.yieldBuf(index);
    }
    firstChild() {
      return this.enterChild(1, 0, 4);
    }
    lastChild() {
      return this.enterChild(-1, 0, 4);
    }
    childAfter(pos) {
      return this.enterChild(1, pos, 2);
    }
    childBefore(pos) {
      return this.enterChild(-1, pos, -2);
    }
    enter(pos, side, mode = this.mode) {
      if (!this.buffer)
        return this.yield(this._tree.enter(pos, side, mode));
      return mode & IterMode.ExcludeBuffers ? false : this.enterChild(1, pos, side);
    }
    parent() {
      if (!this.buffer)
        return this.yieldNode(this.mode & IterMode.IncludeAnonymous ? this._tree._parent : this._tree.parent);
      if (this.stack.length)
        return this.yieldBuf(this.stack.pop());
      let parent = this.mode & IterMode.IncludeAnonymous ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
      this.buffer = null;
      return this.yieldNode(parent);
    }
    sibling(dir) {
      if (!this.buffer)
        return !this._tree._parent ? false : this.yield(this._tree.index < 0 ? null : this._tree._parent.nextChild(this._tree.index + dir, dir, 0, 4, this.mode));
      let {buffer} = this.buffer, d = this.stack.length - 1;
      if (dir < 0) {
        let parentStart = d < 0 ? 0 : this.stack[d] + 4;
        if (this.index != parentStart)
          return this.yieldBuf(buffer.findChild(parentStart, this.index, -1, 0, 4));
      } else {
        let after = buffer.buffer[this.index + 3];
        if (after < (d < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d] + 3]))
          return this.yieldBuf(after);
      }
      return d < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + dir, dir, 0, 4, this.mode)) : false;
    }
    nextSibling() {
      return this.sibling(1);
    }
    prevSibling() {
      return this.sibling(-1);
    }
    atLastNode(dir) {
      let index, parent, {buffer} = this;
      if (buffer) {
        if (dir > 0) {
          if (this.index < buffer.buffer.buffer.length)
            return false;
        } else {
          for (let i = 0; i < this.index; i++)
            if (buffer.buffer.buffer[i + 3] < this.index)
              return false;
        }
        ({index, parent} = buffer);
      } else {
        ({index, _parent: parent} = this._tree);
      }
      for (; parent; {index, _parent: parent} = parent) {
        if (index > -1)
          for (let i = index + dir, e = dir < 0 ? -1 : parent._tree.children.length; i != e; i += dir) {
            let child = parent._tree.children[i];
            if (this.mode & IterMode.IncludeAnonymous || child instanceof TreeBuffer || !child.type.isAnonymous || hasChild(child))
              return false;
          }
      }
      return true;
    }
    move(dir, enter) {
      if (enter && this.enterChild(dir, 0, 4))
        return true;
      for (; ; ) {
        if (this.sibling(dir))
          return true;
        if (this.atLastNode(dir) || !this.parent())
          return false;
      }
    }
    next(enter = true) {
      return this.move(1, enter);
    }
    prev(enter = true) {
      return this.move(-1, enter);
    }
    moveTo(pos, side = 0) {
      while (this.from == this.to || (side < 1 ? this.from >= pos : this.from > pos) || (side > -1 ? this.to <= pos : this.to < pos))
        if (!this.parent())
          break;
      while (this.enterChild(1, pos, side)) {
      }
      return this;
    }
    get node() {
      if (!this.buffer)
        return this._tree;
      let cache2 = this.bufferNode, result = null, depth = 0;
      if (cache2 && cache2.context == this.buffer) {
        scan:
          for (let index = this.index, d = this.stack.length; d >= 0; ) {
            for (let c = cache2; c; c = c._parent)
              if (c.index == index) {
                if (index == this.index)
                  return c;
                result = c;
                depth = d + 1;
                break scan;
              }
            index = this.stack[--d];
          }
      }
      for (let i = depth; i < this.stack.length; i++)
        result = new BufferNode(this.buffer, result, this.stack[i]);
      return this.bufferNode = new BufferNode(this.buffer, result, this.index);
    }
    get tree() {
      return this.buffer ? null : this._tree._tree;
    }
    iterate(enter, leave) {
      for (let depth = 0; ; ) {
        let mustLeave = false;
        if (this.type.isAnonymous || enter(this) !== false) {
          if (this.firstChild()) {
            depth++;
            continue;
          }
          if (!this.type.isAnonymous)
            mustLeave = true;
        }
        for (; ; ) {
          if (mustLeave && leave)
            leave(this);
          mustLeave = this.type.isAnonymous;
          if (this.nextSibling())
            break;
          if (!depth)
            return;
          this.parent();
          depth--;
          mustLeave = true;
        }
      }
    }
    matchContext(context) {
      if (!this.buffer)
        return matchNodeContext(this.node, context);
      let {buffer} = this.buffer, {types: types2} = buffer.set;
      for (let i = context.length - 1, d = this.stack.length - 1; i >= 0; d--) {
        if (d < 0)
          return matchNodeContext(this.node, context, i);
        let type = types2[buffer.buffer[this.stack[d]]];
        if (!type.isAnonymous) {
          if (context[i] && context[i] != type.name)
            return false;
          i--;
        }
      }
      return true;
    }
  };
  function hasChild(tree) {
    return tree.children.some((ch) => ch instanceof TreeBuffer || !ch.type.isAnonymous || hasChild(ch));
  }
  function buildTree(data2) {
    var _a2;
    let {buffer, nodeSet, maxBufferLength = DefaultBufferLength, reused = [], minRepeatType = nodeSet.types.length} = data2;
    let cursor = Array.isArray(buffer) ? new FlatBufferCursor(buffer, buffer.length) : buffer;
    let types2 = nodeSet.types;
    let contextHash = 0, lookAhead = 0;
    function takeNode(parentStart, minPos, children2, positions2, inRepeat) {
      let {id: id2, start, end, size} = cursor;
      let lookAheadAtStart = lookAhead;
      while (size < 0) {
        cursor.next();
        if (size == -1) {
          let node2 = reused[id2];
          children2.push(node2);
          positions2.push(start - parentStart);
          return;
        } else if (size == -3) {
          contextHash = id2;
          return;
        } else if (size == -4) {
          lookAhead = id2;
          return;
        } else {
          throw new RangeError(`Unrecognized record size: ${size}`);
        }
      }
      let type = types2[id2], node, buffer2;
      let startPos = start - parentStart;
      if (end - start <= maxBufferLength && (buffer2 = findBufferSize(cursor.pos - minPos, inRepeat))) {
        let data3 = new Uint16Array(buffer2.size - buffer2.skip);
        let endPos = cursor.pos - buffer2.size, index = data3.length;
        while (cursor.pos > endPos)
          index = copyToBuffer(buffer2.start, data3, index);
        node = new TreeBuffer(data3, end - buffer2.start, nodeSet);
        startPos = buffer2.start - parentStart;
      } else {
        let endPos = cursor.pos - size;
        cursor.next();
        let localChildren = [], localPositions = [];
        let localInRepeat = id2 >= minRepeatType ? id2 : -1;
        let lastGroup = 0, lastEnd = end;
        while (cursor.pos > endPos) {
          if (localInRepeat >= 0 && cursor.id == localInRepeat && cursor.size >= 0) {
            if (cursor.end <= lastEnd - maxBufferLength) {
              makeRepeatLeaf(localChildren, localPositions, start, lastGroup, cursor.end, lastEnd, localInRepeat, lookAheadAtStart);
              lastGroup = localChildren.length;
              lastEnd = cursor.end;
            }
            cursor.next();
          } else {
            takeNode(start, endPos, localChildren, localPositions, localInRepeat);
          }
        }
        if (localInRepeat >= 0 && lastGroup > 0 && lastGroup < localChildren.length)
          makeRepeatLeaf(localChildren, localPositions, start, lastGroup, start, lastEnd, localInRepeat, lookAheadAtStart);
        localChildren.reverse();
        localPositions.reverse();
        if (localInRepeat > -1 && lastGroup > 0) {
          let make = makeBalanced(type);
          node = balanceRange(type, localChildren, localPositions, 0, localChildren.length, 0, end - start, make, make);
        } else {
          node = makeTree(type, localChildren, localPositions, end - start, lookAheadAtStart - end);
        }
      }
      children2.push(node);
      positions2.push(startPos);
    }
    function makeBalanced(type) {
      return (children2, positions2, length2) => {
        let lookAhead2 = 0, lastI = children2.length - 1, last, lookAheadProp;
        if (lastI >= 0 && (last = children2[lastI]) instanceof Tree) {
          if (!lastI && last.type == type && last.length == length2)
            return last;
          if (lookAheadProp = last.prop(NodeProp.lookAhead))
            lookAhead2 = positions2[lastI] + last.length + lookAheadProp;
        }
        return makeTree(type, children2, positions2, length2, lookAhead2);
      };
    }
    function makeRepeatLeaf(children2, positions2, base2, i, from, to, type, lookAhead2) {
      let localChildren = [], localPositions = [];
      while (children2.length > i) {
        localChildren.push(children2.pop());
        localPositions.push(positions2.pop() + base2 - from);
      }
      children2.push(makeTree(nodeSet.types[type], localChildren, localPositions, to - from, lookAhead2 - to));
      positions2.push(from - base2);
    }
    function makeTree(type, children2, positions2, length2, lookAhead2 = 0, props) {
      if (contextHash) {
        let pair2 = [NodeProp.contextHash, contextHash];
        props = props ? [pair2].concat(props) : [pair2];
      }
      if (lookAhead2 > 25) {
        let pair2 = [NodeProp.lookAhead, lookAhead2];
        props = props ? [pair2].concat(props) : [pair2];
      }
      return new Tree(type, children2, positions2, length2, props);
    }
    function findBufferSize(maxSize, inRepeat) {
      let fork = cursor.fork();
      let size = 0, start = 0, skip = 0, minStart = fork.end - maxBufferLength;
      let result = {size: 0, start: 0, skip: 0};
      scan:
        for (let minPos = fork.pos - maxSize; fork.pos > minPos; ) {
          let nodeSize2 = fork.size;
          if (fork.id == inRepeat && nodeSize2 >= 0) {
            result.size = size;
            result.start = start;
            result.skip = skip;
            skip += 4;
            size += 4;
            fork.next();
            continue;
          }
          let startPos = fork.pos - nodeSize2;
          if (nodeSize2 < 0 || startPos < minPos || fork.start < minStart)
            break;
          let localSkipped = fork.id >= minRepeatType ? 4 : 0;
          let nodeStart = fork.start;
          fork.next();
          while (fork.pos > startPos) {
            if (fork.size < 0) {
              if (fork.size == -3)
                localSkipped += 4;
              else
                break scan;
            } else if (fork.id >= minRepeatType) {
              localSkipped += 4;
            }
            fork.next();
          }
          start = nodeStart;
          size += nodeSize2;
          skip += localSkipped;
        }
      if (inRepeat < 0 || size == maxSize) {
        result.size = size;
        result.start = start;
        result.skip = skip;
      }
      return result.size > 4 ? result : void 0;
    }
    function copyToBuffer(bufferStart, buffer2, index) {
      let {id: id2, start, end, size} = cursor;
      cursor.next();
      if (size >= 0 && id2 < minRepeatType) {
        let startIndex = index;
        if (size > 4) {
          let endPos = cursor.pos - (size - 4);
          while (cursor.pos > endPos)
            index = copyToBuffer(bufferStart, buffer2, index);
        }
        buffer2[--index] = startIndex;
        buffer2[--index] = end - bufferStart;
        buffer2[--index] = start - bufferStart;
        buffer2[--index] = id2;
      } else if (size == -3) {
        contextHash = id2;
      } else if (size == -4) {
        lookAhead = id2;
      }
      return index;
    }
    let children = [], positions = [];
    while (cursor.pos > 0)
      takeNode(data2.start || 0, data2.bufferStart || 0, children, positions, -1);
    let length = (_a2 = data2.length) !== null && _a2 !== void 0 ? _a2 : children.length ? positions[0] + children[0].length : 0;
    return new Tree(types2[data2.topID], children.reverse(), positions.reverse(), length);
  }
  var nodeSizeCache = new WeakMap();
  function nodeSize(balanceType, node) {
    if (!balanceType.isAnonymous || node instanceof TreeBuffer || node.type != balanceType)
      return 1;
    let size = nodeSizeCache.get(node);
    if (size == null) {
      size = 1;
      for (let child of node.children) {
        if (child.type != balanceType || !(child instanceof Tree)) {
          size = 1;
          break;
        }
        size += nodeSize(balanceType, child);
      }
      nodeSizeCache.set(node, size);
    }
    return size;
  }
  function balanceRange(balanceType, children, positions, from, to, start, length, mkTop, mkTree) {
    let total = 0;
    for (let i = from; i < to; i++)
      total += nodeSize(balanceType, children[i]);
    let maxChild = Math.ceil(total * 1.5 / 8);
    let localChildren = [], localPositions = [];
    function divide(children2, positions2, from2, to2, offset) {
      for (let i = from2; i < to2; ) {
        let groupFrom = i, groupStart = positions2[i], groupSize = nodeSize(balanceType, children2[i]);
        i++;
        for (; i < to2; i++) {
          let nextSize = nodeSize(balanceType, children2[i]);
          if (groupSize + nextSize >= maxChild)
            break;
          groupSize += nextSize;
        }
        if (i == groupFrom + 1) {
          if (groupSize > maxChild) {
            let only = children2[groupFrom];
            divide(only.children, only.positions, 0, only.children.length, positions2[groupFrom] + offset);
            continue;
          }
          localChildren.push(children2[groupFrom]);
        } else {
          let length2 = positions2[i - 1] + children2[i - 1].length - groupStart;
          localChildren.push(balanceRange(balanceType, children2, positions2, groupFrom, i, groupStart, length2, null, mkTree));
        }
        localPositions.push(groupStart + offset - start);
      }
    }
    divide(children, positions, from, to, 0);
    return (mkTop || mkTree)(localChildren, localPositions, length);
  }
  var NodeWeakMap = class {
    constructor() {
      this.map = new WeakMap();
    }
    setBuffer(buffer, index, value) {
      let inner = this.map.get(buffer);
      if (!inner)
        this.map.set(buffer, inner = new Map());
      inner.set(index, value);
    }
    getBuffer(buffer, index) {
      let inner = this.map.get(buffer);
      return inner && inner.get(index);
    }
    set(node, value) {
      if (node instanceof BufferNode)
        this.setBuffer(node.context.buffer, node.index, value);
      else if (node instanceof TreeNode)
        this.map.set(node.tree, value);
    }
    get(node) {
      return node instanceof BufferNode ? this.getBuffer(node.context.buffer, node.index) : node instanceof TreeNode ? this.map.get(node.tree) : void 0;
    }
    cursorSet(cursor, value) {
      if (cursor.buffer)
        this.setBuffer(cursor.buffer.buffer, cursor.index, value);
      else
        this.map.set(cursor.tree, value);
    }
    cursorGet(cursor) {
      return cursor.buffer ? this.getBuffer(cursor.buffer.buffer, cursor.index) : this.map.get(cursor.tree);
    }
  };
  var TreeFragment = class {
    constructor(from, to, tree, offset, openStart = false, openEnd = false) {
      this.from = from;
      this.to = to;
      this.tree = tree;
      this.offset = offset;
      this.open = (openStart ? 1 : 0) | (openEnd ? 2 : 0);
    }
    get openStart() {
      return (this.open & 1) > 0;
    }
    get openEnd() {
      return (this.open & 2) > 0;
    }
    static addTree(tree, fragments = [], partial = false) {
      let result = [new TreeFragment(0, tree.length, tree, 0, false, partial)];
      for (let f of fragments)
        if (f.to > tree.length)
          result.push(f);
      return result;
    }
    static applyChanges(fragments, changes, minGap = 128) {
      if (!changes.length)
        return fragments;
      let result = [];
      let fI = 1, nextF = fragments.length ? fragments[0] : null;
      for (let cI = 0, pos = 0, off = 0; ; cI++) {
        let nextC = cI < changes.length ? changes[cI] : null;
        let nextPos = nextC ? nextC.fromA : 1e9;
        if (nextPos - pos >= minGap)
          while (nextF && nextF.from < nextPos) {
            let cut = nextF;
            if (pos >= cut.from || nextPos <= cut.to || off) {
              let fFrom = Math.max(cut.from, pos) - off, fTo = Math.min(cut.to, nextPos) - off;
              cut = fFrom >= fTo ? null : new TreeFragment(fFrom, fTo, cut.tree, cut.offset + off, cI > 0, !!nextC);
            }
            if (cut)
              result.push(cut);
            if (nextF.to > nextPos)
              break;
            nextF = fI < fragments.length ? fragments[fI++] : null;
          }
        if (!nextC)
          break;
        pos = nextC.toA;
        off = nextC.toA - nextC.toB;
      }
      return result;
    }
  };
  var Parser = class {
    startParse(input, fragments, ranges) {
      if (typeof input == "string")
        input = new StringInput(input);
      ranges = !ranges ? [new Range2(0, input.length)] : ranges.length ? ranges.map((r) => new Range2(r.from, r.to)) : [new Range2(0, 0)];
      return this.createParse(input, fragments || [], ranges);
    }
    parse(input, fragments, ranges) {
      let parse = this.startParse(input, fragments, ranges);
      for (; ; ) {
        let done = parse.advance();
        if (done)
          return done;
      }
    }
  };
  var StringInput = class {
    constructor(string2) {
      this.string = string2;
    }
    get length() {
      return this.string.length;
    }
    chunk(from) {
      return this.string.slice(from);
    }
    get lineChunks() {
      return false;
    }
    read(from, to) {
      return this.string.slice(from, to);
    }
  };
  function parseMixed(nest) {
    return (parse, input, fragments, ranges) => new MixedParse(parse, nest, input, fragments, ranges);
  }
  var InnerParse = class {
    constructor(parser7, parse, overlay, target, ranges) {
      this.parser = parser7;
      this.parse = parse;
      this.overlay = overlay;
      this.target = target;
      this.ranges = ranges;
    }
  };
  var ActiveOverlay = class {
    constructor(parser7, predicate, mounts, index, start, target, prev) {
      this.parser = parser7;
      this.predicate = predicate;
      this.mounts = mounts;
      this.index = index;
      this.start = start;
      this.target = target;
      this.prev = prev;
      this.depth = 0;
      this.ranges = [];
    }
  };
  var stoppedInner = new NodeProp({perNode: true});
  var MixedParse = class {
    constructor(base2, nest, input, fragments, ranges) {
      this.nest = nest;
      this.input = input;
      this.fragments = fragments;
      this.ranges = ranges;
      this.inner = [];
      this.innerDone = 0;
      this.baseTree = null;
      this.stoppedAt = null;
      this.baseParse = base2;
    }
    advance() {
      if (this.baseParse) {
        let done2 = this.baseParse.advance();
        if (!done2)
          return null;
        this.baseParse = null;
        this.baseTree = done2;
        this.startInner();
        if (this.stoppedAt != null)
          for (let inner2 of this.inner)
            inner2.parse.stopAt(this.stoppedAt);
      }
      if (this.innerDone == this.inner.length) {
        let result = this.baseTree;
        if (this.stoppedAt != null)
          result = new Tree(result.type, result.children, result.positions, result.length, result.propValues.concat([[stoppedInner, this.stoppedAt]]));
        return result;
      }
      let inner = this.inner[this.innerDone], done = inner.parse.advance();
      if (done) {
        this.innerDone++;
        let props = Object.assign(Object.create(null), inner.target.props);
        props[NodeProp.mounted.id] = new MountedTree(done, inner.overlay, inner.parser);
        inner.target.props = props;
      }
      return null;
    }
    get parsedPos() {
      if (this.baseParse)
        return 0;
      let pos = this.input.length;
      for (let i = this.innerDone; i < this.inner.length; i++) {
        if (this.inner[i].ranges[0].from < pos)
          pos = Math.min(pos, this.inner[i].parse.parsedPos);
      }
      return pos;
    }
    stopAt(pos) {
      this.stoppedAt = pos;
      if (this.baseParse)
        this.baseParse.stopAt(pos);
      else
        for (let i = this.innerDone; i < this.inner.length; i++)
          this.inner[i].parse.stopAt(pos);
    }
    startInner() {
      let fragmentCursor = new FragmentCursor(this.fragments);
      let overlay = null;
      let covered = null;
      let cursor = new TreeCursor(new TreeNode(this.baseTree, this.ranges[0].from, 0, null), IterMode.IncludeAnonymous | IterMode.IgnoreMounts);
      scan:
        for (let nest, isCovered; this.stoppedAt == null || cursor.from < this.stoppedAt; ) {
          let enter = true, range;
          if (fragmentCursor.hasNode(cursor)) {
            if (overlay) {
              let match = overlay.mounts.find((m) => m.frag.from <= cursor.from && m.frag.to >= cursor.to && m.mount.overlay);
              if (match)
                for (let r of match.mount.overlay) {
                  let from = r.from + match.pos, to = r.to + match.pos;
                  if (from >= cursor.from && to <= cursor.to && !overlay.ranges.some((r2) => r2.from < to && r2.to > from))
                    overlay.ranges.push({from, to});
                }
            }
            enter = false;
          } else if (covered && (isCovered = checkCover(covered.ranges, cursor.from, cursor.to))) {
            enter = isCovered != 2;
          } else if (!cursor.type.isAnonymous && cursor.from < cursor.to && (nest = this.nest(cursor, this.input))) {
            if (!cursor.tree)
              materialize(cursor);
            let oldMounts = fragmentCursor.findMounts(cursor.from, nest.parser);
            if (typeof nest.overlay == "function") {
              overlay = new ActiveOverlay(nest.parser, nest.overlay, oldMounts, this.inner.length, cursor.from, cursor.tree, overlay);
            } else {
              let ranges = punchRanges(this.ranges, nest.overlay || [new Range2(cursor.from, cursor.to)]);
              if (ranges.length)
                this.inner.push(new InnerParse(nest.parser, nest.parser.startParse(this.input, enterFragments(oldMounts, ranges), ranges), nest.overlay ? nest.overlay.map((r) => new Range2(r.from - cursor.from, r.to - cursor.from)) : null, cursor.tree, ranges));
              if (!nest.overlay)
                enter = false;
              else if (ranges.length)
                covered = {ranges, depth: 0, prev: covered};
            }
          } else if (overlay && (range = overlay.predicate(cursor))) {
            if (range === true)
              range = new Range2(cursor.from, cursor.to);
            if (range.from < range.to)
              overlay.ranges.push(range);
          }
          if (enter && cursor.firstChild()) {
            if (overlay)
              overlay.depth++;
            if (covered)
              covered.depth++;
          } else {
            for (; ; ) {
              if (cursor.nextSibling())
                break;
              if (!cursor.parent())
                break scan;
              if (overlay && !--overlay.depth) {
                let ranges = punchRanges(this.ranges, overlay.ranges);
                if (ranges.length)
                  this.inner.splice(overlay.index, 0, new InnerParse(overlay.parser, overlay.parser.startParse(this.input, enterFragments(overlay.mounts, ranges), ranges), overlay.ranges.map((r) => new Range2(r.from - overlay.start, r.to - overlay.start)), overlay.target, ranges));
                overlay = overlay.prev;
              }
              if (covered && !--covered.depth)
                covered = covered.prev;
            }
          }
        }
    }
  };
  function checkCover(covered, from, to) {
    for (let range of covered) {
      if (range.from >= to)
        break;
      if (range.to > from)
        return range.from <= from && range.to >= to ? 2 : 1;
    }
    return 0;
  }
  function sliceBuf(buf, startI, endI, nodes, positions, off) {
    if (startI < endI) {
      let from = buf.buffer[startI + 1], to = buf.buffer[endI - 2];
      nodes.push(buf.slice(startI, endI, from, to));
      positions.push(from - off);
    }
  }
  function materialize(cursor) {
    let {node} = cursor, depth = 0;
    do {
      cursor.parent();
      depth++;
    } while (!cursor.tree);
    let i = 0, base2 = cursor.tree, off = 0;
    for (; ; i++) {
      off = base2.positions[i] + cursor.from;
      if (off <= node.from && off + base2.children[i].length >= node.to)
        break;
    }
    let buf = base2.children[i], b = buf.buffer;
    function split(startI, endI, type, innerOffset, length) {
      let i2 = startI;
      while (b[i2 + 2] + off <= node.from)
        i2 = b[i2 + 3];
      let children = [], positions = [];
      sliceBuf(buf, startI, i2, children, positions, innerOffset);
      let from = b[i2 + 1], to = b[i2 + 2];
      let isTarget = from + off == node.from && to + off == node.to && b[i2] == node.type.id;
      children.push(isTarget ? node.toTree() : split(i2 + 4, b[i2 + 3], buf.set.types[b[i2]], from, to - from));
      positions.push(from - innerOffset);
      sliceBuf(buf, b[i2 + 3], endI, children, positions, innerOffset);
      return new Tree(type, children, positions, length);
    }
    base2.children[i] = split(0, b.length, NodeType.none, 0, buf.length);
    for (let d = 0; d <= depth; d++)
      cursor.childAfter(node.from);
  }
  var StructureCursor = class {
    constructor(root, offset) {
      this.offset = offset;
      this.done = false;
      this.cursor = root.cursor(IterMode.IncludeAnonymous | IterMode.IgnoreMounts);
    }
    moveTo(pos) {
      let {cursor} = this, p = pos - this.offset;
      while (!this.done && cursor.from < p) {
        if (cursor.to >= pos && cursor.enter(p, 1, IterMode.IgnoreOverlays | IterMode.ExcludeBuffers))
          ;
        else if (!cursor.next(false))
          this.done = true;
      }
    }
    hasNode(cursor) {
      this.moveTo(cursor.from);
      if (!this.done && this.cursor.from + this.offset == cursor.from && this.cursor.tree) {
        for (let tree = this.cursor.tree; ; ) {
          if (tree == cursor.tree)
            return true;
          if (tree.children.length && tree.positions[0] == 0 && tree.children[0] instanceof Tree)
            tree = tree.children[0];
          else
            break;
        }
      }
      return false;
    }
  };
  var FragmentCursor = class {
    constructor(fragments) {
      var _a2;
      this.fragments = fragments;
      this.curTo = 0;
      this.fragI = 0;
      if (fragments.length) {
        let first = this.curFrag = fragments[0];
        this.curTo = (_a2 = first.tree.prop(stoppedInner)) !== null && _a2 !== void 0 ? _a2 : first.to;
        this.inner = new StructureCursor(first.tree, -first.offset);
      } else {
        this.curFrag = this.inner = null;
      }
    }
    hasNode(node) {
      while (this.curFrag && node.from >= this.curTo)
        this.nextFrag();
      return this.curFrag && this.curFrag.from <= node.from && this.curTo >= node.to && this.inner.hasNode(node);
    }
    nextFrag() {
      var _a2;
      this.fragI++;
      if (this.fragI == this.fragments.length) {
        this.curFrag = this.inner = null;
      } else {
        let frag = this.curFrag = this.fragments[this.fragI];
        this.curTo = (_a2 = frag.tree.prop(stoppedInner)) !== null && _a2 !== void 0 ? _a2 : frag.to;
        this.inner = new StructureCursor(frag.tree, -frag.offset);
      }
    }
    findMounts(pos, parser7) {
      var _a2;
      let result = [];
      if (this.inner) {
        this.inner.cursor.moveTo(pos, 1);
        for (let pos2 = this.inner.cursor.node; pos2; pos2 = pos2.parent) {
          let mount = (_a2 = pos2.tree) === null || _a2 === void 0 ? void 0 : _a2.prop(NodeProp.mounted);
          if (mount && mount.parser == parser7) {
            for (let i = this.fragI; i < this.fragments.length; i++) {
              let frag = this.fragments[i];
              if (frag.from >= pos2.to)
                break;
              if (frag.tree == this.curFrag.tree)
                result.push({
                  frag,
                  pos: pos2.from - frag.offset,
                  mount
                });
            }
          }
        }
      }
      return result;
    }
  };
  function punchRanges(outer, ranges) {
    let copy = null, current = ranges;
    for (let i = 1, j = 0; i < outer.length; i++) {
      let gapFrom = outer[i - 1].to, gapTo = outer[i].from;
      for (; j < current.length; j++) {
        let r = current[j];
        if (r.from >= gapTo)
          break;
        if (r.to <= gapFrom)
          continue;
        if (!copy)
          current = copy = ranges.slice();
        if (r.from < gapFrom) {
          copy[j] = new Range2(r.from, gapFrom);
          if (r.to > gapTo)
            copy.splice(j + 1, 0, new Range2(gapTo, r.to));
        } else if (r.to > gapTo) {
          copy[j--] = new Range2(gapTo, r.to);
        } else {
          copy.splice(j--, 1);
        }
      }
    }
    return current;
  }
  function findCoverChanges(a, b, from, to) {
    let iA = 0, iB = 0, inA = false, inB = false, pos = -1e9;
    let result = [];
    for (; ; ) {
      let nextA = iA == a.length ? 1e9 : inA ? a[iA].to : a[iA].from;
      let nextB = iB == b.length ? 1e9 : inB ? b[iB].to : b[iB].from;
      if (inA != inB) {
        let start = Math.max(pos, from), end = Math.min(nextA, nextB, to);
        if (start < end)
          result.push(new Range2(start, end));
      }
      pos = Math.min(nextA, nextB);
      if (pos == 1e9)
        break;
      if (nextA == pos) {
        if (!inA)
          inA = true;
        else {
          inA = false;
          iA++;
        }
      }
      if (nextB == pos) {
        if (!inB)
          inB = true;
        else {
          inB = false;
          iB++;
        }
      }
    }
    return result;
  }
  function enterFragments(mounts, ranges) {
    let result = [];
    for (let {pos, mount, frag} of mounts) {
      let startPos = pos + (mount.overlay ? mount.overlay[0].from : 0), endPos = startPos + mount.tree.length;
      let from = Math.max(frag.from, startPos), to = Math.min(frag.to, endPos);
      if (mount.overlay) {
        let overlay = mount.overlay.map((r) => new Range2(r.from + pos, r.to + pos));
        let changes = findCoverChanges(ranges, overlay, from, to);
        for (let i = 0, pos2 = from; ; i++) {
          let last = i == changes.length, end = last ? to : changes[i].from;
          if (end > pos2)
            result.push(new TreeFragment(pos2, end, mount.tree, -startPos, frag.from >= pos2 || frag.openStart, frag.to <= end || frag.openEnd));
          if (last)
            break;
          pos2 = changes[i].to;
        }
      } else {
        result.push(new TreeFragment(from, to, mount.tree, -startPos, frag.from >= startPos || frag.openStart, frag.to <= endPos || frag.openEnd));
      }
    }
    return result;
  }

  // node_modules/@lezer/highlight/dist/index.js
  var nextTagID = 0;
  var Tag = class {
    constructor(set, base2, modified) {
      this.set = set;
      this.base = base2;
      this.modified = modified;
      this.id = nextTagID++;
    }
    static define(parent) {
      if (parent === null || parent === void 0 ? void 0 : parent.base)
        throw new Error("Can not derive from a modified tag");
      let tag = new Tag([], null, []);
      tag.set.push(tag);
      if (parent)
        for (let t2 of parent.set)
          tag.set.push(t2);
      return tag;
    }
    static defineModifier() {
      let mod = new Modifier();
      return (tag) => {
        if (tag.modified.indexOf(mod) > -1)
          return tag;
        return Modifier.get(tag.base || tag, tag.modified.concat(mod).sort((a, b) => a.id - b.id));
      };
    }
  };
  var nextModifierID = 0;
  var Modifier = class {
    constructor() {
      this.instances = [];
      this.id = nextModifierID++;
    }
    static get(base2, mods) {
      if (!mods.length)
        return base2;
      let exists = mods[0].instances.find((t2) => t2.base == base2 && sameArray2(mods, t2.modified));
      if (exists)
        return exists;
      let set = [], tag = new Tag(set, base2, mods);
      for (let m of mods)
        m.instances.push(tag);
      let configs = powerSet(mods);
      for (let parent of base2.set)
        if (!parent.modified.length)
          for (let config of configs)
            set.push(Modifier.get(parent, config));
      return tag;
    }
  };
  function sameArray2(a, b) {
    return a.length == b.length && a.every((x, i) => x == b[i]);
  }
  function powerSet(array) {
    let sets = [[]];
    for (let i = 0; i < array.length; i++) {
      for (let j = 0, e = sets.length; j < e; j++) {
        sets.push(sets[j].concat(array[i]));
      }
    }
    return sets.sort((a, b) => b.length - a.length);
  }
  function styleTags(spec) {
    let byName = Object.create(null);
    for (let prop in spec) {
      let tags3 = spec[prop];
      if (!Array.isArray(tags3))
        tags3 = [tags3];
      for (let part of prop.split(" "))
        if (part) {
          let pieces = [], mode = 2, rest = part;
          for (let pos = 0; ; ) {
            if (rest == "..." && pos > 0 && pos + 3 == part.length) {
              mode = 1;
              break;
            }
            let m = /^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(rest);
            if (!m)
              throw new RangeError("Invalid path: " + part);
            pieces.push(m[0] == "*" ? "" : m[0][0] == '"' ? JSON.parse(m[0]) : m[0]);
            pos += m[0].length;
            if (pos == part.length)
              break;
            let next = part[pos++];
            if (pos == part.length && next == "!") {
              mode = 0;
              break;
            }
            if (next != "/")
              throw new RangeError("Invalid path: " + part);
            rest = part.slice(pos);
          }
          let last = pieces.length - 1, inner = pieces[last];
          if (!inner)
            throw new RangeError("Invalid path: " + part);
          let rule = new Rule(tags3, mode, last > 0 ? pieces.slice(0, last) : null);
          byName[inner] = rule.sort(byName[inner]);
        }
    }
    return ruleNodeProp.add(byName);
  }
  var ruleNodeProp = new NodeProp();
  var Rule = class {
    constructor(tags3, mode, context, next) {
      this.tags = tags3;
      this.mode = mode;
      this.context = context;
      this.next = next;
    }
    get opaque() {
      return this.mode == 0;
    }
    get inherit() {
      return this.mode == 1;
    }
    sort(other) {
      if (!other || other.depth < this.depth) {
        this.next = other;
        return this;
      }
      other.next = this.sort(other.next);
      return other;
    }
    get depth() {
      return this.context ? this.context.length : 0;
    }
  };
  Rule.empty = new Rule([], 2, null);
  function tagHighlighter(tags3, options) {
    let map = Object.create(null);
    for (let style of tags3) {
      if (!Array.isArray(style.tag))
        map[style.tag.id] = style.class;
      else
        for (let tag of style.tag)
          map[tag.id] = style.class;
    }
    let {scope, all = null} = options || {};
    return {
      style: (tags4) => {
        let cls = all;
        for (let tag of tags4) {
          for (let sub of tag.set) {
            let tagClass = map[sub.id];
            if (tagClass) {
              cls = cls ? cls + " " + tagClass : tagClass;
              break;
            }
          }
        }
        return cls;
      },
      scope
    };
  }
  function highlightTags(highlighters, tags3) {
    let result = null;
    for (let highlighter of highlighters) {
      let value = highlighter.style(tags3);
      if (value)
        result = result ? result + " " + value : value;
    }
    return result;
  }
  function highlightTree(tree, highlighter, putStyle, from = 0, to = tree.length) {
    let builder = new HighlightBuilder(from, Array.isArray(highlighter) ? highlighter : [highlighter], putStyle);
    builder.highlightRange(tree.cursor(), from, to, "", builder.highlighters);
    builder.flush(to);
  }
  var HighlightBuilder = class {
    constructor(at, highlighters, span) {
      this.at = at;
      this.highlighters = highlighters;
      this.span = span;
      this.class = "";
    }
    startSpan(at, cls) {
      if (cls != this.class) {
        this.flush(at);
        if (at > this.at)
          this.at = at;
        this.class = cls;
      }
    }
    flush(to) {
      if (to > this.at && this.class)
        this.span(this.at, to, this.class);
    }
    highlightRange(cursor, from, to, inheritedClass, highlighters) {
      let {type, from: start, to: end} = cursor;
      if (start >= to || end <= from)
        return;
      if (type.isTop)
        highlighters = this.highlighters.filter((h) => !h.scope || h.scope(type));
      let cls = inheritedClass;
      let rule = getStyleTags(cursor) || Rule.empty;
      let tagCls = highlightTags(highlighters, rule.tags);
      if (tagCls) {
        if (cls)
          cls += " ";
        cls += tagCls;
        if (rule.mode == 1)
          inheritedClass += (inheritedClass ? " " : "") + tagCls;
      }
      this.startSpan(cursor.from, cls);
      if (rule.opaque)
        return;
      let mounted = cursor.tree && cursor.tree.prop(NodeProp.mounted);
      if (mounted && mounted.overlay) {
        let inner = cursor.node.enter(mounted.overlay[0].from + start, 1);
        let innerHighlighters = this.highlighters.filter((h) => !h.scope || h.scope(mounted.tree.type));
        let hasChild2 = cursor.firstChild();
        for (let i = 0, pos = start; ; i++) {
          let next = i < mounted.overlay.length ? mounted.overlay[i] : null;
          let nextPos = next ? next.from + start : end;
          let rangeFrom = Math.max(from, pos), rangeTo = Math.min(to, nextPos);
          if (rangeFrom < rangeTo && hasChild2) {
            while (cursor.from < rangeTo) {
              this.highlightRange(cursor, rangeFrom, rangeTo, inheritedClass, highlighters);
              this.startSpan(Math.min(to, cursor.to), cls);
              if (cursor.to >= nextPos || !cursor.nextSibling())
                break;
            }
          }
          if (!next || nextPos > to)
            break;
          pos = next.to + start;
          if (pos > from) {
            this.highlightRange(inner.cursor(), Math.max(from, next.from + start), Math.min(to, pos), inheritedClass, innerHighlighters);
            this.startSpan(pos, cls);
          }
        }
        if (hasChild2)
          cursor.parent();
      } else if (cursor.firstChild()) {
        do {
          if (cursor.to <= from)
            continue;
          if (cursor.from >= to)
            break;
          this.highlightRange(cursor, from, to, inheritedClass, highlighters);
          this.startSpan(Math.min(to, cursor.to), cls);
        } while (cursor.nextSibling());
        cursor.parent();
      }
    }
  };
  function getStyleTags(node) {
    let rule = node.type.prop(ruleNodeProp);
    while (rule && rule.context && !node.matchContext(rule.context))
      rule = rule.next;
    return rule || null;
  }
  var t = Tag.define;
  var comment = t();
  var name = t();
  var typeName = t(name);
  var propertyName = t(name);
  var literal = t();
  var string = t(literal);
  var number = t(literal);
  var content = t();
  var heading = t(content);
  var keyword = t();
  var operator = t();
  var punctuation = t();
  var bracket = t(punctuation);
  var meta = t();
  var tags = {
    comment,
    lineComment: t(comment),
    blockComment: t(comment),
    docComment: t(comment),
    name,
    variableName: t(name),
    typeName,
    tagName: t(typeName),
    propertyName,
    attributeName: t(propertyName),
    className: t(name),
    labelName: t(name),
    namespace: t(name),
    macroName: t(name),
    literal,
    string,
    docString: t(string),
    character: t(string),
    attributeValue: t(string),
    number,
    integer: t(number),
    float: t(number),
    bool: t(literal),
    regexp: t(literal),
    escape: t(literal),
    color: t(literal),
    url: t(literal),
    keyword,
    self: t(keyword),
    null: t(keyword),
    atom: t(keyword),
    unit: t(keyword),
    modifier: t(keyword),
    operatorKeyword: t(keyword),
    controlKeyword: t(keyword),
    definitionKeyword: t(keyword),
    moduleKeyword: t(keyword),
    operator,
    derefOperator: t(operator),
    arithmeticOperator: t(operator),
    logicOperator: t(operator),
    bitwiseOperator: t(operator),
    compareOperator: t(operator),
    updateOperator: t(operator),
    definitionOperator: t(operator),
    typeOperator: t(operator),
    controlOperator: t(operator),
    punctuation,
    separator: t(punctuation),
    bracket,
    angleBracket: t(bracket),
    squareBracket: t(bracket),
    paren: t(bracket),
    brace: t(bracket),
    content,
    heading,
    heading1: t(heading),
    heading2: t(heading),
    heading3: t(heading),
    heading4: t(heading),
    heading5: t(heading),
    heading6: t(heading),
    contentSeparator: t(content),
    list: t(content),
    quote: t(content),
    emphasis: t(content),
    strong: t(content),
    link: t(content),
    monospace: t(content),
    strikethrough: t(content),
    inserted: t(),
    deleted: t(),
    changed: t(),
    invalid: t(),
    meta,
    documentMeta: t(meta),
    annotation: t(meta),
    processingInstruction: t(meta),
    definition: Tag.defineModifier(),
    constant: Tag.defineModifier(),
    function: Tag.defineModifier(),
    standard: Tag.defineModifier(),
    local: Tag.defineModifier(),
    special: Tag.defineModifier()
  };
  var classHighlighter = tagHighlighter([
    {tag: tags.link, class: "tok-link"},
    {tag: tags.heading, class: "tok-heading"},
    {tag: tags.emphasis, class: "tok-emphasis"},
    {tag: tags.strong, class: "tok-strong"},
    {tag: tags.keyword, class: "tok-keyword"},
    {tag: tags.atom, class: "tok-atom"},
    {tag: tags.bool, class: "tok-bool"},
    {tag: tags.url, class: "tok-url"},
    {tag: tags.labelName, class: "tok-labelName"},
    {tag: tags.inserted, class: "tok-inserted"},
    {tag: tags.deleted, class: "tok-deleted"},
    {tag: tags.literal, class: "tok-literal"},
    {tag: tags.string, class: "tok-string"},
    {tag: tags.number, class: "tok-number"},
    {tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2"},
    {tag: tags.variableName, class: "tok-variableName"},
    {tag: tags.local(tags.variableName), class: "tok-variableName tok-local"},
    {tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition"},
    {tag: tags.special(tags.variableName), class: "tok-variableName2"},
    {tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition"},
    {tag: tags.typeName, class: "tok-typeName"},
    {tag: tags.namespace, class: "tok-namespace"},
    {tag: tags.className, class: "tok-className"},
    {tag: tags.macroName, class: "tok-macroName"},
    {tag: tags.propertyName, class: "tok-propertyName"},
    {tag: tags.operator, class: "tok-operator"},
    {tag: tags.comment, class: "tok-comment"},
    {tag: tags.meta, class: "tok-meta"},
    {tag: tags.invalid, class: "tok-invalid"},
    {tag: tags.punctuation, class: "tok-punctuation"}
  ]);

  // node_modules/@codemirror/language/dist/index.js
  var _a;
  var languageDataProp = /* @__PURE__ */ new NodeProp();
  function defineLanguageFacet(baseData) {
    return Facet.define({
      combine: baseData ? (values2) => values2.concat(baseData) : void 0
    });
  }
  var Language = class {
    constructor(data2, parser7, extraExtensions = [], name2 = "") {
      this.data = data2;
      this.name = name2;
      if (!EditorState.prototype.hasOwnProperty("tree"))
        Object.defineProperty(EditorState.prototype, "tree", {get() {
          return syntaxTree(this);
        }});
      this.parser = parser7;
      this.extension = [
        language.of(this),
        EditorState.languageData.of((state, pos, side) => state.facet(languageDataFacetAt(state, pos, side)))
      ].concat(extraExtensions);
    }
    isActiveAt(state, pos, side = -1) {
      return languageDataFacetAt(state, pos, side) == this.data;
    }
    findRegions(state) {
      let lang = state.facet(language);
      if ((lang === null || lang === void 0 ? void 0 : lang.data) == this.data)
        return [{from: 0, to: state.doc.length}];
      if (!lang || !lang.allowsNesting)
        return [];
      let result = [];
      let explore = (tree, from) => {
        if (tree.prop(languageDataProp) == this.data) {
          result.push({from, to: from + tree.length});
          return;
        }
        let mount = tree.prop(NodeProp.mounted);
        if (mount) {
          if (mount.tree.prop(languageDataProp) == this.data) {
            if (mount.overlay)
              for (let r of mount.overlay)
                result.push({from: r.from + from, to: r.to + from});
            else
              result.push({from, to: from + tree.length});
            return;
          } else if (mount.overlay) {
            let size = result.length;
            explore(mount.tree, mount.overlay[0].from + from);
            if (result.length > size)
              return;
          }
        }
        for (let i = 0; i < tree.children.length; i++) {
          let ch = tree.children[i];
          if (ch instanceof Tree)
            explore(ch, tree.positions[i] + from);
        }
      };
      explore(syntaxTree(state), 0);
      return result;
    }
    get allowsNesting() {
      return true;
    }
  };
  Language.setState = /* @__PURE__ */ StateEffect.define();
  function languageDataFacetAt(state, pos, side) {
    let topLang = state.facet(language);
    if (!topLang)
      return null;
    let facet = topLang.data;
    if (topLang.allowsNesting) {
      for (let node = syntaxTree(state).topNode; node; node = node.enter(pos, side, IterMode.ExcludeBuffers))
        facet = node.type.prop(languageDataProp) || facet;
    }
    return facet;
  }
  var LRLanguage = class extends Language {
    constructor(data2, parser7, name2) {
      super(data2, parser7, [], name2);
      this.parser = parser7;
    }
    static define(spec) {
      let data2 = defineLanguageFacet(spec.languageData);
      return new LRLanguage(data2, spec.parser.configure({
        props: [languageDataProp.add((type) => type.isTop ? data2 : void 0)]
      }), spec.name);
    }
    configure(options, name2) {
      return new LRLanguage(this.data, this.parser.configure(options), name2 || this.name);
    }
    get allowsNesting() {
      return this.parser.hasWrappers();
    }
  };
  function syntaxTree(state) {
    let field = state.field(Language.state, false);
    return field ? field.tree : Tree.empty;
  }
  var DocInput = class {
    constructor(doc2, length = doc2.length) {
      this.doc = doc2;
      this.length = length;
      this.cursorPos = 0;
      this.string = "";
      this.cursor = doc2.iter();
    }
    syncTo(pos) {
      this.string = this.cursor.next(pos - this.cursorPos).value;
      this.cursorPos = pos + this.string.length;
      return this.cursorPos - this.string.length;
    }
    chunk(pos) {
      this.syncTo(pos);
      return this.string;
    }
    get lineChunks() {
      return true;
    }
    read(from, to) {
      let stringStart = this.cursorPos - this.string.length;
      if (from < stringStart || to >= this.cursorPos)
        return this.doc.sliceString(from, to);
      else
        return this.string.slice(from - stringStart, to - stringStart);
    }
  };
  var currentContext = null;
  var ParseContext = class {
    constructor(parser7, state, fragments = [], tree, treeLen, viewport, skipped, scheduleOn) {
      this.parser = parser7;
      this.state = state;
      this.fragments = fragments;
      this.tree = tree;
      this.treeLen = treeLen;
      this.viewport = viewport;
      this.skipped = skipped;
      this.scheduleOn = scheduleOn;
      this.parse = null;
      this.tempSkipped = [];
    }
    static create(parser7, state, viewport) {
      return new ParseContext(parser7, state, [], Tree.empty, 0, viewport, [], null);
    }
    startParse() {
      return this.parser.startParse(new DocInput(this.state.doc), this.fragments);
    }
    work(until, upto) {
      if (upto != null && upto >= this.state.doc.length)
        upto = void 0;
      if (this.tree != Tree.empty && this.isDone(upto !== null && upto !== void 0 ? upto : this.state.doc.length)) {
        this.takeTree();
        return true;
      }
      return this.withContext(() => {
        var _a2;
        if (typeof until == "number") {
          let endTime = Date.now() + until;
          until = () => Date.now() > endTime;
        }
        if (!this.parse)
          this.parse = this.startParse();
        if (upto != null && (this.parse.stoppedAt == null || this.parse.stoppedAt > upto) && upto < this.state.doc.length)
          this.parse.stopAt(upto);
        for (; ; ) {
          let done = this.parse.advance();
          if (done) {
            this.fragments = this.withoutTempSkipped(TreeFragment.addTree(done, this.fragments, this.parse.stoppedAt != null));
            this.treeLen = (_a2 = this.parse.stoppedAt) !== null && _a2 !== void 0 ? _a2 : this.state.doc.length;
            this.tree = done;
            this.parse = null;
            if (this.treeLen < (upto !== null && upto !== void 0 ? upto : this.state.doc.length))
              this.parse = this.startParse();
            else
              return true;
          }
          if (until())
            return false;
        }
      });
    }
    takeTree() {
      let pos, tree;
      if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
        if (this.parse.stoppedAt == null || this.parse.stoppedAt > pos)
          this.parse.stopAt(pos);
        this.withContext(() => {
          while (!(tree = this.parse.advance())) {
          }
        });
        this.treeLen = pos;
        this.tree = tree;
        this.fragments = this.withoutTempSkipped(TreeFragment.addTree(this.tree, this.fragments, true));
        this.parse = null;
      }
    }
    withContext(f) {
      let prev = currentContext;
      currentContext = this;
      try {
        return f();
      } finally {
        currentContext = prev;
      }
    }
    withoutTempSkipped(fragments) {
      for (let r; r = this.tempSkipped.pop(); )
        fragments = cutFragments(fragments, r.from, r.to);
      return fragments;
    }
    changes(changes, newState) {
      let {fragments, tree, treeLen, viewport, skipped} = this;
      this.takeTree();
      if (!changes.empty) {
        let ranges = [];
        changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({fromA, toA, fromB, toB}));
        fragments = TreeFragment.applyChanges(fragments, ranges);
        tree = Tree.empty;
        treeLen = 0;
        viewport = {from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1)};
        if (this.skipped.length) {
          skipped = [];
          for (let r of this.skipped) {
            let from = changes.mapPos(r.from, 1), to = changes.mapPos(r.to, -1);
            if (from < to)
              skipped.push({from, to});
          }
        }
      }
      return new ParseContext(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }
    updateViewport(viewport) {
      if (this.viewport.from == viewport.from && this.viewport.to == viewport.to)
        return false;
      this.viewport = viewport;
      let startLen = this.skipped.length;
      for (let i = 0; i < this.skipped.length; i++) {
        let {from, to} = this.skipped[i];
        if (from < viewport.to && to > viewport.from) {
          this.fragments = cutFragments(this.fragments, from, to);
          this.skipped.splice(i--, 1);
        }
      }
      if (this.skipped.length >= startLen)
        return false;
      this.reset();
      return true;
    }
    reset() {
      if (this.parse) {
        this.takeTree();
        this.parse = null;
      }
    }
    skipUntilInView(from, to) {
      this.skipped.push({from, to});
    }
    static getSkippingParser(until) {
      return new class extends Parser {
        createParse(input, fragments, ranges) {
          let from = ranges[0].from, to = ranges[ranges.length - 1].to;
          let parser7 = {
            parsedPos: from,
            advance() {
              let cx = currentContext;
              if (cx) {
                for (let r of ranges)
                  cx.tempSkipped.push(r);
                if (until)
                  cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
              }
              this.parsedPos = to;
              return new Tree(NodeType.none, [], [], to - from);
            },
            stoppedAt: null,
            stopAt() {
            }
          };
          return parser7;
        }
      }();
    }
    isDone(upto) {
      upto = Math.min(upto, this.state.doc.length);
      let frags = this.fragments;
      return this.treeLen >= upto && frags.length && frags[0].from == 0 && frags[0].to >= upto;
    }
    static get() {
      return currentContext;
    }
  };
  function cutFragments(fragments, from, to) {
    return TreeFragment.applyChanges(fragments, [{fromA: from, toA: to, fromB: from, toB: to}]);
  }
  var LanguageState = class {
    constructor(context) {
      this.context = context;
      this.tree = context.tree;
    }
    apply(tr) {
      if (!tr.docChanged && this.tree == this.context.tree)
        return this;
      let newCx = this.context.changes(tr.changes, tr.state);
      let upto = this.context.treeLen == tr.startState.doc.length ? void 0 : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
      if (!newCx.work(20, upto))
        newCx.takeTree();
      return new LanguageState(newCx);
    }
    static init(state) {
      let vpTo = Math.min(3e3, state.doc.length);
      let parseState = ParseContext.create(state.facet(language).parser, state, {from: 0, to: vpTo});
      if (!parseState.work(20, vpTo))
        parseState.takeTree();
      return new LanguageState(parseState);
    }
  };
  Language.state = /* @__PURE__ */ StateField.define({
    create: LanguageState.init,
    update(value, tr) {
      for (let e of tr.effects)
        if (e.is(Language.setState))
          return e.value;
      if (tr.startState.facet(language) != tr.state.facet(language))
        return LanguageState.init(tr.state);
      return value.apply(tr);
    }
  });
  var requestIdle = (callback) => {
    let timeout = setTimeout(() => callback(), 500);
    return () => clearTimeout(timeout);
  };
  if (typeof requestIdleCallback != "undefined")
    requestIdle = (callback) => {
      let idle = -1, timeout = setTimeout(() => {
        idle = requestIdleCallback(callback, {timeout: 500 - 100});
      }, 100);
      return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    };
  var isInputPending = typeof navigator != "undefined" && ((_a = navigator.scheduling) === null || _a === void 0 ? void 0 : _a.isInputPending) ? () => navigator.scheduling.isInputPending() : null;
  var parseWorker = /* @__PURE__ */ ViewPlugin.fromClass(class ParseWorker {
    constructor(view) {
      this.view = view;
      this.working = null;
      this.workScheduled = 0;
      this.chunkEnd = -1;
      this.chunkBudget = -1;
      this.work = this.work.bind(this);
      this.scheduleWork();
    }
    update(update) {
      let cx = this.view.state.field(Language.state).context;
      if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen)
        this.scheduleWork();
      if (update.docChanged) {
        if (this.view.hasFocus)
          this.chunkBudget += 50;
        this.scheduleWork();
      }
      this.checkAsyncSchedule(cx);
    }
    scheduleWork() {
      if (this.working)
        return;
      let {state} = this.view, field = state.field(Language.state);
      if (field.tree != field.context.tree || !field.context.isDone(state.doc.length))
        this.working = requestIdle(this.work);
    }
    work(deadline) {
      this.working = null;
      let now = Date.now();
      if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) {
        this.chunkEnd = now + 3e4;
        this.chunkBudget = 3e3;
      }
      if (this.chunkBudget <= 0)
        return;
      let {state, viewport: {to: vpTo}} = this.view, field = state.field(Language.state);
      if (field.tree == field.context.tree && field.context.isDone(vpTo + 1e5))
        return;
      let endTime = Date.now() + Math.min(this.chunkBudget, 100, deadline && !isInputPending ? Math.max(25, deadline.timeRemaining() - 5) : 1e9);
      let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1e3;
      let done = field.context.work(() => {
        return isInputPending && isInputPending() || Date.now() > endTime;
      }, vpTo + (viewportFirst ? 0 : 1e5));
      this.chunkBudget -= Date.now() - now;
      if (done || this.chunkBudget <= 0) {
        field.context.takeTree();
        this.view.dispatch({effects: Language.setState.of(new LanguageState(field.context))});
      }
      if (this.chunkBudget > 0 && !(done && !viewportFirst))
        this.scheduleWork();
      this.checkAsyncSchedule(field.context);
    }
    checkAsyncSchedule(cx) {
      if (cx.scheduleOn) {
        this.workScheduled++;
        cx.scheduleOn.then(() => this.scheduleWork()).catch((err) => logException(this.view.state, err)).then(() => this.workScheduled--);
        cx.scheduleOn = null;
      }
    }
    destroy() {
      if (this.working)
        this.working();
    }
    isWorking() {
      return !!(this.working || this.workScheduled > 0);
    }
  }, {
    eventHandlers: {focus() {
      this.scheduleWork();
    }}
  });
  var language = /* @__PURE__ */ Facet.define({
    combine(languages) {
      return languages.length ? languages[0] : null;
    },
    enables: (language2) => [
      Language.state,
      parseWorker,
      EditorView.contentAttributes.compute([language2], (state) => {
        let lang = state.facet(language2);
        return lang && lang.name ? {"data-language": lang.name} : {};
      })
    ]
  });
  var LanguageSupport = class {
    constructor(language2, support = []) {
      this.language = language2;
      this.support = support;
      this.extension = [language2, support];
    }
  };
  var LanguageDescription = class {
    constructor(name2, alias, extensions, filename, loadFunc, support = void 0) {
      this.name = name2;
      this.alias = alias;
      this.extensions = extensions;
      this.filename = filename;
      this.loadFunc = loadFunc;
      this.support = support;
      this.loading = null;
    }
    load() {
      return this.loading || (this.loading = this.loadFunc().then((support) => this.support = support, (err) => {
        this.loading = null;
        throw err;
      }));
    }
    static of(spec) {
      let {load, support} = spec;
      if (!load) {
        if (!support)
          throw new RangeError("Must pass either 'load' or 'support' to LanguageDescription.of");
        load = () => Promise.resolve(support);
      }
      return new LanguageDescription(spec.name, (spec.alias || []).concat(spec.name).map((s) => s.toLowerCase()), spec.extensions || [], spec.filename, load, support);
    }
    static matchFilename(descs, filename) {
      for (let d of descs)
        if (d.filename && d.filename.test(filename))
          return d;
      let ext = /\.([^.]+)$/.exec(filename);
      if (ext) {
        for (let d of descs)
          if (d.extensions.indexOf(ext[1]) > -1)
            return d;
      }
      return null;
    }
    static matchLanguageName(descs, name2, fuzzy = true) {
      name2 = name2.toLowerCase();
      for (let d of descs)
        if (d.alias.some((a) => a == name2))
          return d;
      if (fuzzy)
        for (let d of descs)
          for (let a of d.alias) {
            let found = name2.indexOf(a);
            if (found > -1 && (a.length > 2 || !/\w/.test(name2[found - 1]) && !/\w/.test(name2[found + a.length])))
              return d;
          }
      return null;
    }
  };
  var indentUnit = /* @__PURE__ */ Facet.define({
    combine: (values2) => {
      if (!values2.length)
        return "  ";
      if (!/^(?: +|\t+)$/.test(values2[0]))
        throw new Error("Invalid indent unit: " + JSON.stringify(values2[0]));
      return values2[0];
    }
  });
  function getIndentUnit(state) {
    let unit = state.facet(indentUnit);
    return unit.charCodeAt(0) == 9 ? state.tabSize * unit.length : unit.length;
  }
  function indentString(state, cols) {
    let result = "", ts = state.tabSize;
    if (state.facet(indentUnit).charCodeAt(0) == 9)
      while (cols >= ts) {
        result += "	";
        cols -= ts;
      }
    for (let i = 0; i < cols; i++)
      result += " ";
    return result;
  }
  var indentNodeProp = /* @__PURE__ */ new NodeProp();
  function bracketedAligned(context) {
    let tree = context.node;
    let openToken = tree.childAfter(tree.from), last = tree.lastChild;
    if (!openToken)
      return null;
    let sim = context.options.simulateBreak;
    let openLine = context.state.doc.lineAt(openToken.from);
    let lineEnd2 = sim == null || sim <= openLine.from ? openLine.to : Math.min(openLine.to, sim);
    for (let pos = openToken.to; ; ) {
      let next = tree.childAfter(pos);
      if (!next || next == last)
        return null;
      if (!next.type.isSkipped)
        return next.from < lineEnd2 ? openToken : null;
      pos = next.to;
    }
  }
  function delimitedIndent({closing, align = true, units = 1}) {
    return (context) => delimitedStrategy(context, align, units, closing);
  }
  function delimitedStrategy(context, align, units, closing, closedAt) {
    let after = context.textAfter, space4 = after.match(/^\s*/)[0].length;
    let closed = closing && after.slice(space4, space4 + closing.length) == closing || closedAt == context.pos + space4;
    let aligned = align ? bracketedAligned(context) : null;
    if (aligned)
      return closed ? context.column(aligned.from) : context.column(aligned.to);
    return context.baseIndent + (closed ? 0 : context.unit * units);
  }
  var flatIndent = (context) => context.baseIndent;
  function continuedIndent({except, units = 1} = {}) {
    return (context) => {
      let matchExcept = except && except.test(context.textAfter);
      return context.baseIndent + (matchExcept ? 0 : units * context.unit);
    };
  }
  var foldNodeProp = /* @__PURE__ */ new NodeProp();
  function foldInside(node) {
    let first = node.firstChild, last = node.lastChild;
    return first && first.to < last.from ? {from: first.to, to: last.type.isError ? node.to : last.from} : null;
  }
  var HighlightStyle = class {
    constructor(specs, options) {
      this.specs = specs;
      let modSpec;
      function def(spec) {
        let cls = StyleModule.newName();
        (modSpec || (modSpec = Object.create(null)))["." + cls] = spec;
        return cls;
      }
      const all = typeof options.all == "string" ? options.all : options.all ? def(options.all) : void 0;
      const scopeOpt = options.scope;
      this.scope = scopeOpt instanceof Language ? (type) => type.prop(languageDataProp) == scopeOpt.data : scopeOpt ? (type) => type == scopeOpt : void 0;
      this.style = tagHighlighter(specs.map((style) => ({
        tag: style.tag,
        class: style.class || def(Object.assign({}, style, {tag: null}))
      })), {
        all
      }).style;
      this.module = modSpec ? new StyleModule(modSpec) : null;
      this.themeType = options.themeType;
    }
    static define(specs, options) {
      return new HighlightStyle(specs, options || {});
    }
  };
  var highlighterFacet = /* @__PURE__ */ Facet.define();
  var fallbackHighlighter = /* @__PURE__ */ Facet.define({
    combine(values2) {
      return values2.length ? [values2[0]] : null;
    }
  });
  function getHighlighters(state) {
    let main = state.facet(highlighterFacet);
    return main.length ? main : state.facet(fallbackHighlighter);
  }
  function syntaxHighlighting(highlighter, options) {
    let ext = [treeHighlighter], themeType;
    if (highlighter instanceof HighlightStyle) {
      if (highlighter.module)
        ext.push(EditorView.styleModule.of(highlighter.module));
      themeType = highlighter.themeType;
    }
    if (options === null || options === void 0 ? void 0 : options.fallback)
      ext.push(fallbackHighlighter.of(highlighter));
    else if (themeType)
      ext.push(highlighterFacet.computeN([EditorView.darkTheme], (state) => {
        return state.facet(EditorView.darkTheme) == (themeType == "dark") ? [highlighter] : [];
      }));
    else
      ext.push(highlighterFacet.of(highlighter));
    return ext;
  }
  var TreeHighlighter = class {
    constructor(view) {
      this.markCache = Object.create(null);
      this.tree = syntaxTree(view.state);
      this.decorations = this.buildDeco(view, getHighlighters(view.state));
    }
    update(update) {
      let tree = syntaxTree(update.state), highlighters = getHighlighters(update.state);
      let styleChange = highlighters != getHighlighters(update.startState);
      if (tree.length < update.view.viewport.to && !styleChange && tree.type == this.tree.type) {
        this.decorations = this.decorations.map(update.changes);
      } else if (tree != this.tree || update.viewportChanged || styleChange) {
        this.tree = tree;
        this.decorations = this.buildDeco(update.view, highlighters);
      }
    }
    buildDeco(view, highlighters) {
      if (!highlighters || !this.tree.length)
        return Decoration.none;
      let builder = new RangeSetBuilder();
      for (let {from, to} of view.visibleRanges) {
        highlightTree(this.tree, highlighters, (from2, to2, style) => {
          builder.add(from2, to2, this.markCache[style] || (this.markCache[style] = Decoration.mark({class: style})));
        }, from, to);
      }
      return builder.finish();
    }
  };
  var treeHighlighter = /* @__PURE__ */ Prec.high(/* @__PURE__ */ ViewPlugin.fromClass(TreeHighlighter, {
    decorations: (v) => v.decorations
  }));
  var defaultHighlightStyle = /* @__PURE__ */ HighlightStyle.define([
    {
      tag: tags.meta,
      color: "#7a757a"
    },
    {
      tag: tags.link,
      textDecoration: "underline"
    },
    {
      tag: tags.heading,
      textDecoration: "underline",
      fontWeight: "bold"
    },
    {
      tag: tags.emphasis,
      fontStyle: "italic"
    },
    {
      tag: tags.strong,
      fontWeight: "bold"
    },
    {
      tag: tags.strikethrough,
      textDecoration: "line-through"
    },
    {
      tag: tags.keyword,
      color: "#708"
    },
    {
      tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
      color: "#219"
    },
    {
      tag: [tags.literal, tags.inserted],
      color: "#164"
    },
    {
      tag: [tags.string, tags.deleted],
      color: "#a11"
    },
    {
      tag: [tags.regexp, tags.escape, /* @__PURE__ */ tags.special(tags.string)],
      color: "#e40"
    },
    {
      tag: /* @__PURE__ */ tags.definition(tags.variableName),
      color: "#00f"
    },
    {
      tag: /* @__PURE__ */ tags.local(tags.variableName),
      color: "#30a"
    },
    {
      tag: [tags.typeName, tags.namespace],
      color: "#085"
    },
    {
      tag: tags.className,
      color: "#167"
    },
    {
      tag: [/* @__PURE__ */ tags.special(tags.variableName), tags.macroName],
      color: "#256"
    },
    {
      tag: /* @__PURE__ */ tags.definition(tags.propertyName),
      color: "#00c"
    },
    {
      tag: tags.comment,
      color: "#940"
    },
    {
      tag: tags.invalid,
      color: "#f00"
    }
  ]);
  var noTokens = /* @__PURE__ */ Object.create(null);
  var typeArray = [NodeType.none];
  var warned = [];
  var defaultTable = /* @__PURE__ */ Object.create(null);
  for (let [legacyName, name2] of [
    ["variable", "variableName"],
    ["variable-2", "variableName.special"],
    ["string-2", "string.special"],
    ["def", "variableName.definition"],
    ["tag", "tagName"],
    ["attribute", "attributeName"],
    ["type", "typeName"],
    ["builtin", "variableName.standard"],
    ["qualifier", "modifier"],
    ["error", "invalid"],
    ["header", "heading"],
    ["property", "propertyName"]
  ])
    defaultTable[legacyName] = /* @__PURE__ */ createTokenType(noTokens, name2);
  function warnForPart(part, msg) {
    if (warned.indexOf(part) > -1)
      return;
    warned.push(part);
    console.warn(msg);
  }
  function createTokenType(extra, tagStr) {
    let tag = null;
    for (let part of tagStr.split(".")) {
      let value = extra[part] || tags[part];
      if (!value) {
        warnForPart(part, `Unknown highlighting tag ${part}`);
      } else if (typeof value == "function") {
        if (!tag)
          warnForPart(part, `Modifier ${part} used at start of tag`);
        else
          tag = value(tag);
      } else {
        if (tag)
          warnForPart(part, `Tag ${part} used as modifier`);
        else
          tag = value;
      }
    }
    if (!tag)
      return 0;
    let name2 = tagStr.replace(/ /g, "_"), type = NodeType.define({
      id: typeArray.length,
      name: name2,
      props: [styleTags({[name2]: tag})]
    });
    typeArray.push(type);
    return type.id;
  }

  // node_modules/@codemirror/commands/dist/index.js
  var fromHistory = /* @__PURE__ */ Annotation.define();
  var invertedEffects = /* @__PURE__ */ Facet.define();
  var HistEvent = class {
    constructor(changes, effects, mapped, startSelection, selectionsAfter) {
      this.changes = changes;
      this.effects = effects;
      this.mapped = mapped;
      this.startSelection = startSelection;
      this.selectionsAfter = selectionsAfter;
    }
    setSelAfter(after) {
      return new HistEvent(this.changes, this.effects, this.mapped, this.startSelection, after);
    }
    toJSON() {
      var _a2, _b, _c;
      return {
        changes: (_a2 = this.changes) === null || _a2 === void 0 ? void 0 : _a2.toJSON(),
        mapped: (_b = this.mapped) === null || _b === void 0 ? void 0 : _b.toJSON(),
        startSelection: (_c = this.startSelection) === null || _c === void 0 ? void 0 : _c.toJSON(),
        selectionsAfter: this.selectionsAfter.map((s) => s.toJSON())
      };
    }
    static fromJSON(json2) {
      return new HistEvent(json2.changes && ChangeSet.fromJSON(json2.changes), [], json2.mapped && ChangeDesc.fromJSON(json2.mapped), json2.startSelection && EditorSelection.fromJSON(json2.startSelection), json2.selectionsAfter.map(EditorSelection.fromJSON));
    }
    static fromTransaction(tr, selection) {
      let effects = none2;
      for (let invert of tr.startState.facet(invertedEffects)) {
        let result = invert(tr);
        if (result.length)
          effects = effects.concat(result);
      }
      if (!effects.length && tr.changes.empty)
        return null;
      return new HistEvent(tr.changes.invert(tr.startState.doc), effects, void 0, selection || tr.startState.selection, none2);
    }
    static selection(selections) {
      return new HistEvent(void 0, none2, void 0, void 0, selections);
    }
  };
  function updateBranch(branch, to, maxLen, newEvent) {
    let start = to + 1 > maxLen + 20 ? to - maxLen - 1 : 0;
    let newBranch = branch.slice(start, to);
    newBranch.push(newEvent);
    return newBranch;
  }
  function isAdjacent(a, b) {
    let ranges = [], isAdjacent2 = false;
    a.iterChangedRanges((f, t2) => ranges.push(f, t2));
    b.iterChangedRanges((_f, _t, f, t2) => {
      for (let i = 0; i < ranges.length; ) {
        let from = ranges[i++], to = ranges[i++];
        if (t2 >= from && f <= to)
          isAdjacent2 = true;
      }
    });
    return isAdjacent2;
  }
  function eqSelectionShape(a, b) {
    return a.ranges.length == b.ranges.length && a.ranges.filter((r, i) => r.empty != b.ranges[i].empty).length === 0;
  }
  function conc(a, b) {
    return !a.length ? b : !b.length ? a : a.concat(b);
  }
  var none2 = [];
  var MaxSelectionsPerEvent = 200;
  function addSelection(branch, selection) {
    if (!branch.length) {
      return [HistEvent.selection([selection])];
    } else {
      let lastEvent = branch[branch.length - 1];
      let sels = lastEvent.selectionsAfter.slice(Math.max(0, lastEvent.selectionsAfter.length - MaxSelectionsPerEvent));
      if (sels.length && sels[sels.length - 1].eq(selection))
        return branch;
      sels.push(selection);
      return updateBranch(branch, branch.length - 1, 1e9, lastEvent.setSelAfter(sels));
    }
  }
  function popSelection(branch) {
    let last = branch[branch.length - 1];
    let newBranch = branch.slice();
    newBranch[branch.length - 1] = last.setSelAfter(last.selectionsAfter.slice(0, last.selectionsAfter.length - 1));
    return newBranch;
  }
  function addMappingToBranch(branch, mapping) {
    if (!branch.length)
      return branch;
    let length = branch.length, selections = none2;
    while (length) {
      let event = mapEvent(branch[length - 1], mapping, selections);
      if (event.changes && !event.changes.empty || event.effects.length) {
        let result = branch.slice(0, length);
        result[length - 1] = event;
        return result;
      } else {
        mapping = event.mapped;
        length--;
        selections = event.selectionsAfter;
      }
    }
    return selections.length ? [HistEvent.selection(selections)] : none2;
  }
  function mapEvent(event, mapping, extraSelections) {
    let selections = conc(event.selectionsAfter.length ? event.selectionsAfter.map((s) => s.map(mapping)) : none2, extraSelections);
    if (!event.changes)
      return HistEvent.selection(selections);
    let mappedChanges = event.changes.map(mapping), before = mapping.mapDesc(event.changes, true);
    let fullMapping = event.mapped ? event.mapped.composeDesc(before) : before;
    return new HistEvent(mappedChanges, StateEffect.mapEffects(event.effects, mapping), fullMapping, event.startSelection.map(before), selections);
  }
  var joinableUserEvent = /^(input\.type|delete)($|\.)/;
  var HistoryState = class {
    constructor(done, undone, prevTime = 0, prevUserEvent = void 0) {
      this.done = done;
      this.undone = undone;
      this.prevTime = prevTime;
      this.prevUserEvent = prevUserEvent;
    }
    isolate() {
      return this.prevTime ? new HistoryState(this.done, this.undone) : this;
    }
    addChanges(event, time, userEvent, newGroupDelay, maxLen) {
      let done = this.done, lastEvent = done[done.length - 1];
      if (lastEvent && lastEvent.changes && !lastEvent.changes.empty && event.changes && (!userEvent || joinableUserEvent.test(userEvent)) && (!lastEvent.selectionsAfter.length && time - this.prevTime < newGroupDelay && isAdjacent(lastEvent.changes, event.changes) || userEvent == "input.type.compose")) {
        done = updateBranch(done, done.length - 1, maxLen, new HistEvent(event.changes.compose(lastEvent.changes), conc(event.effects, lastEvent.effects), lastEvent.mapped, lastEvent.startSelection, none2));
      } else {
        done = updateBranch(done, done.length, maxLen, event);
      }
      return new HistoryState(done, none2, time, userEvent);
    }
    addSelection(selection, time, userEvent, newGroupDelay) {
      let last = this.done.length ? this.done[this.done.length - 1].selectionsAfter : none2;
      if (last.length > 0 && time - this.prevTime < newGroupDelay && userEvent == this.prevUserEvent && userEvent && /^select($|\.)/.test(userEvent) && eqSelectionShape(last[last.length - 1], selection))
        return this;
      return new HistoryState(addSelection(this.done, selection), this.undone, time, userEvent);
    }
    addMapping(mapping) {
      return new HistoryState(addMappingToBranch(this.done, mapping), addMappingToBranch(this.undone, mapping), this.prevTime, this.prevUserEvent);
    }
    pop(side, state, selection) {
      let branch = side == 0 ? this.done : this.undone;
      if (branch.length == 0)
        return null;
      let event = branch[branch.length - 1];
      if (selection && event.selectionsAfter.length) {
        return state.update({
          selection: event.selectionsAfter[event.selectionsAfter.length - 1],
          annotations: fromHistory.of({side, rest: popSelection(branch)}),
          userEvent: side == 0 ? "select.undo" : "select.redo",
          scrollIntoView: true
        });
      } else if (!event.changes) {
        return null;
      } else {
        let rest = branch.length == 1 ? none2 : branch.slice(0, branch.length - 1);
        if (event.mapped)
          rest = addMappingToBranch(rest, event.mapped);
        return state.update({
          changes: event.changes,
          selection: event.startSelection,
          effects: event.effects,
          annotations: fromHistory.of({side, rest}),
          filter: false,
          userEvent: side == 0 ? "undo" : "redo",
          scrollIntoView: true
        });
      }
    }
  };
  HistoryState.empty = /* @__PURE__ */ new HistoryState(none2, none2);
  function changeBySelectedLine(state, f) {
    let atLine = -1;
    return state.changeByRange((range) => {
      let changes = [];
      for (let pos = range.from; pos <= range.to; ) {
        let line = state.doc.lineAt(pos);
        if (line.number > atLine && (range.empty || range.to > line.from)) {
          f(line, changes, range);
          atLine = line.number;
        }
        pos = line.to + 1;
      }
      let changeSet = state.changes(changes);
      return {
        changes,
        range: EditorSelection.range(changeSet.mapPos(range.anchor, 1), changeSet.mapPos(range.head, 1))
      };
    });
  }
  var indentMore = ({state, dispatch}) => {
    if (state.readOnly)
      return false;
    dispatch(state.update(changeBySelectedLine(state, (line, changes) => {
      changes.push({from: line.from, insert: state.facet(indentUnit)});
    }), {userEvent: "input.indent"}));
    return true;
  };
  var indentLess = ({state, dispatch}) => {
    if (state.readOnly)
      return false;
    dispatch(state.update(changeBySelectedLine(state, (line, changes) => {
      let space4 = /^\s*/.exec(line.text)[0];
      if (!space4)
        return;
      let col = countColumn(space4, state.tabSize), keep = 0;
      let insert2 = indentString(state, Math.max(0, col - getIndentUnit(state)));
      while (keep < space4.length && keep < insert2.length && space4.charCodeAt(keep) == insert2.charCodeAt(keep))
        keep++;
      changes.push({from: line.from + keep, to: line.from + space4.length, insert: insert2.slice(keep)});
    }), {userEvent: "delete.dedent"}));
    return true;
  };
  var indentWithTab = {key: "Tab", run: indentMore, shift: indentLess};

  // node_modules/@codemirror/autocomplete/dist/index.js
  var CompletionContext = class {
    constructor(state, pos, explicit) {
      this.state = state;
      this.pos = pos;
      this.explicit = explicit;
      this.abortListeners = [];
    }
    tokenBefore(types2) {
      let token = syntaxTree(this.state).resolveInner(this.pos, -1);
      while (token && types2.indexOf(token.name) < 0)
        token = token.parent;
      return token ? {
        from: token.from,
        to: this.pos,
        text: this.state.sliceDoc(token.from, this.pos),
        type: token.type
      } : null;
    }
    matchBefore(expr) {
      let line = this.state.doc.lineAt(this.pos);
      let start = Math.max(line.from, this.pos - 250);
      let str = line.text.slice(start - line.from, this.pos - line.from);
      let found = str.search(ensureAnchor(expr, false));
      return found < 0 ? null : {from: start + found, to: this.pos, text: str.slice(found)};
    }
    get aborted() {
      return this.abortListeners == null;
    }
    addEventListener(type, listener) {
      if (type == "abort" && this.abortListeners)
        this.abortListeners.push(listener);
    }
  };
  function toSet(chars) {
    let flat = Object.keys(chars).join("");
    let words = /\w/.test(flat);
    if (words)
      flat = flat.replace(/\w/g, "");
    return `[${words ? "\\w" : ""}${flat.replace(/[^\w\s]/g, "\\$&")}]`;
  }
  function prefixMatch(options) {
    let first = Object.create(null), rest = Object.create(null);
    for (let {label} of options) {
      first[label[0]] = true;
      for (let i = 1; i < label.length; i++)
        rest[label[i]] = true;
    }
    let source = toSet(first) + toSet(rest) + "*$";
    return [new RegExp("^" + source), new RegExp(source)];
  }
  function completeFromList(list) {
    let options = list.map((o) => typeof o == "string" ? {label: o} : o);
    let [validFor, match] = options.every((o) => /^\w+$/.test(o.label)) ? [/\w*$/, /\w+$/] : prefixMatch(options);
    return (context) => {
      let token = context.matchBefore(match);
      return token || context.explicit ? {from: token ? token.from : context.pos, options, validFor} : null;
    };
  }
  function ifNotIn(nodes, source) {
    return (context) => {
      for (let pos = syntaxTree(context.state).resolveInner(context.pos, -1); pos; pos = pos.parent)
        if (nodes.indexOf(pos.name) > -1)
          return null;
      return source(context);
    };
  }
  var Option = class {
    constructor(completion, source, match) {
      this.completion = completion;
      this.source = source;
      this.match = match;
    }
  };
  function cur(state) {
    return state.selection.main.head;
  }
  function ensureAnchor(expr, start) {
    var _a2;
    let {source} = expr;
    let addStart = start && source[0] != "^", addEnd = source[source.length - 1] != "$";
    if (!addStart && !addEnd)
      return expr;
    return new RegExp(`${addStart ? "^" : ""}(?:${source})${addEnd ? "$" : ""}`, (_a2 = expr.flags) !== null && _a2 !== void 0 ? _a2 : expr.ignoreCase ? "i" : "");
  }
  var pickedCompletion = /* @__PURE__ */ Annotation.define();
  function insertCompletionText(state, text, from, to) {
    return Object.assign(Object.assign({}, state.changeByRange((range) => {
      if (range == state.selection.main)
        return {
          changes: {from, to, insert: text},
          range: EditorSelection.cursor(from + text.length)
        };
      let len = to - from;
      if (!range.empty || len && state.sliceDoc(range.from - len, range.from) != state.sliceDoc(from, to))
        return {range};
      return {
        changes: {from: range.from - len, to: range.from, insert: text},
        range: EditorSelection.cursor(range.from - len + text.length)
      };
    })), {userEvent: "input.complete"});
  }
  function applyCompletion(view, option) {
    const apply = option.completion.apply || option.completion.label;
    let result = option.source;
    if (typeof apply == "string")
      view.dispatch(Object.assign(Object.assign({}, insertCompletionText(view.state, apply, result.from, result.to)), {annotations: pickedCompletion.of(option.completion)}));
    else
      apply(view, option.completion, result.from, result.to);
  }
  var SourceCache = /* @__PURE__ */ new WeakMap();
  function asSource(source) {
    if (!Array.isArray(source))
      return source;
    let known = SourceCache.get(source);
    if (!known)
      SourceCache.set(source, known = completeFromList(source));
    return known;
  }
  var FuzzyMatcher = class {
    constructor(pattern) {
      this.pattern = pattern;
      this.chars = [];
      this.folded = [];
      this.any = [];
      this.precise = [];
      this.byWord = [];
      for (let p = 0; p < pattern.length; ) {
        let char = codePointAt(pattern, p), size = codePointSize(char);
        this.chars.push(char);
        let part = pattern.slice(p, p + size), upper = part.toUpperCase();
        this.folded.push(codePointAt(upper == part ? part.toLowerCase() : upper, 0));
        p += size;
      }
      this.astral = pattern.length != this.chars.length;
    }
    match(word) {
      if (this.pattern.length == 0)
        return [0];
      if (word.length < this.pattern.length)
        return null;
      let {chars, folded, any, precise, byWord} = this;
      if (chars.length == 1) {
        let first = codePointAt(word, 0);
        return first == chars[0] ? [0, 0, codePointSize(first)] : first == folded[0] ? [-200, 0, codePointSize(first)] : null;
      }
      let direct = word.indexOf(this.pattern);
      if (direct == 0)
        return [0, 0, this.pattern.length];
      let len = chars.length, anyTo = 0;
      if (direct < 0) {
        for (let i = 0, e = Math.min(word.length, 200); i < e && anyTo < len; ) {
          let next = codePointAt(word, i);
          if (next == chars[anyTo] || next == folded[anyTo])
            any[anyTo++] = i;
          i += codePointSize(next);
        }
        if (anyTo < len)
          return null;
      }
      let preciseTo = 0;
      let byWordTo = 0, byWordFolded = false;
      let adjacentTo = 0, adjacentStart = -1, adjacentEnd = -1;
      let hasLower = /[a-z]/.test(word), wordAdjacent = true;
      for (let i = 0, e = Math.min(word.length, 200), prevType = 0; i < e && byWordTo < len; ) {
        let next = codePointAt(word, i);
        if (direct < 0) {
          if (preciseTo < len && next == chars[preciseTo])
            precise[preciseTo++] = i;
          if (adjacentTo < len) {
            if (next == chars[adjacentTo] || next == folded[adjacentTo]) {
              if (adjacentTo == 0)
                adjacentStart = i;
              adjacentEnd = i + 1;
              adjacentTo++;
            } else {
              adjacentTo = 0;
            }
          }
        }
        let ch, type = next < 255 ? next >= 48 && next <= 57 || next >= 97 && next <= 122 ? 2 : next >= 65 && next <= 90 ? 1 : 0 : (ch = fromCodePoint(next)) != ch.toLowerCase() ? 1 : ch != ch.toUpperCase() ? 2 : 0;
        if (!i || type == 1 && hasLower || prevType == 0 && type != 0) {
          if (chars[byWordTo] == next || folded[byWordTo] == next && (byWordFolded = true))
            byWord[byWordTo++] = i;
          else if (byWord.length)
            wordAdjacent = false;
        }
        prevType = type;
        i += codePointSize(next);
      }
      if (byWordTo == len && byWord[0] == 0 && wordAdjacent)
        return this.result(-100 + (byWordFolded ? -200 : 0), byWord, word);
      if (adjacentTo == len && adjacentStart == 0)
        return [-200 - word.length, 0, adjacentEnd];
      if (direct > -1)
        return [-700 - word.length, direct, direct + this.pattern.length];
      if (adjacentTo == len)
        return [-200 + -700 - word.length, adjacentStart, adjacentEnd];
      if (byWordTo == len)
        return this.result(-100 + (byWordFolded ? -200 : 0) + -700 + (wordAdjacent ? 0 : -1100), byWord, word);
      return chars.length == 2 ? null : this.result((any[0] ? -700 : 0) + -200 + -1100, any, word);
    }
    result(score2, positions, word) {
      let result = [score2 - word.length], i = 1;
      for (let pos of positions) {
        let to = pos + (this.astral ? codePointSize(codePointAt(word, pos)) : 1);
        if (i > 1 && result[i - 1] == pos)
          result[i - 1] = to;
        else {
          result[i++] = pos;
          result[i++] = to;
        }
      }
      return result;
    }
  };
  var completionConfig = /* @__PURE__ */ Facet.define({
    combine(configs) {
      return combineConfig(configs, {
        activateOnTyping: true,
        selectOnOpen: true,
        override: null,
        closeOnBlur: true,
        maxRenderedOptions: 100,
        defaultKeymap: true,
        optionClass: () => "",
        aboveCursor: false,
        icons: true,
        addToOptions: [],
        compareCompletions: (a, b) => a.label.localeCompare(b.label),
        interactionDelay: 75
      }, {
        defaultKeymap: (a, b) => a && b,
        closeOnBlur: (a, b) => a && b,
        icons: (a, b) => a && b,
        optionClass: (a, b) => (c) => joinClass(a(c), b(c)),
        addToOptions: (a, b) => a.concat(b)
      });
    }
  });
  function joinClass(a, b) {
    return a ? b ? a + " " + b : a : b;
  }
  function optionContent(config) {
    let content2 = config.addToOptions.slice();
    if (config.icons)
      content2.push({
        render(completion) {
          let icon = document.createElement("div");
          icon.classList.add("cm-completionIcon");
          if (completion.type)
            icon.classList.add(...completion.type.split(/\s+/g).map((cls) => "cm-completionIcon-" + cls));
          icon.setAttribute("aria-hidden", "true");
          return icon;
        },
        position: 20
      });
    content2.push({
      render(completion, _s, match) {
        let labelElt = document.createElement("span");
        labelElt.className = "cm-completionLabel";
        let {label} = completion, off = 0;
        for (let j = 1; j < match.length; ) {
          let from = match[j++], to = match[j++];
          if (from > off)
            labelElt.appendChild(document.createTextNode(label.slice(off, from)));
          let span = labelElt.appendChild(document.createElement("span"));
          span.appendChild(document.createTextNode(label.slice(from, to)));
          span.className = "cm-completionMatchedText";
          off = to;
        }
        if (off < label.length)
          labelElt.appendChild(document.createTextNode(label.slice(off)));
        return labelElt;
      },
      position: 50
    }, {
      render(completion) {
        if (!completion.detail)
          return null;
        let detailElt = document.createElement("span");
        detailElt.className = "cm-completionDetail";
        detailElt.textContent = completion.detail;
        return detailElt;
      },
      position: 80
    });
    return content2.sort((a, b) => a.position - b.position).map((a) => a.render);
  }
  function rangeAroundSelected(total, selected, max) {
    if (total <= max)
      return {from: 0, to: total};
    if (selected < 0)
      selected = 0;
    if (selected <= total >> 1) {
      let off2 = Math.floor(selected / max);
      return {from: off2 * max, to: (off2 + 1) * max};
    }
    let off = Math.floor((total - selected) / max);
    return {from: total - (off + 1) * max, to: total - off * max};
  }
  var CompletionTooltip = class {
    constructor(view, stateField) {
      this.view = view;
      this.stateField = stateField;
      this.info = null;
      this.placeInfo = {
        read: () => this.measureInfo(),
        write: (pos) => this.positionInfo(pos),
        key: this
      };
      this.space = null;
      let cState = view.state.field(stateField);
      let {options, selected} = cState.open;
      let config = view.state.facet(completionConfig);
      this.optionContent = optionContent(config);
      this.optionClass = config.optionClass;
      this.range = rangeAroundSelected(options.length, selected, config.maxRenderedOptions);
      this.dom = document.createElement("div");
      this.dom.className = "cm-tooltip-autocomplete";
      this.dom.addEventListener("mousedown", (e) => {
        for (let dom = e.target, match; dom && dom != this.dom; dom = dom.parentNode) {
          if (dom.nodeName == "LI" && (match = /-(\d+)$/.exec(dom.id)) && +match[1] < options.length) {
            applyCompletion(view, options[+match[1]]);
            e.preventDefault();
            return;
          }
        }
      });
      this.list = this.dom.appendChild(this.createListBox(options, cState.id, this.range));
      this.list.addEventListener("scroll", () => {
        if (this.info)
          this.view.requestMeasure(this.placeInfo);
      });
    }
    mount() {
      this.updateSel();
    }
    update(update) {
      var _a2, _b, _c;
      let cState = update.state.field(this.stateField);
      let prevState = update.startState.field(this.stateField);
      if (cState != prevState) {
        this.updateSel();
        if (((_a2 = cState.open) === null || _a2 === void 0 ? void 0 : _a2.disabled) != ((_b = prevState.open) === null || _b === void 0 ? void 0 : _b.disabled))
          this.dom.classList.toggle("cm-tooltip-autocomplete-disabled", !!((_c = cState.open) === null || _c === void 0 ? void 0 : _c.disabled));
      }
    }
    positioned(space4) {
      this.space = space4;
      if (this.info)
        this.view.requestMeasure(this.placeInfo);
    }
    updateSel() {
      let cState = this.view.state.field(this.stateField), open = cState.open;
      if (open.selected > -1 && open.selected < this.range.from || open.selected >= this.range.to) {
        this.range = rangeAroundSelected(open.options.length, open.selected, this.view.state.facet(completionConfig).maxRenderedOptions);
        this.list.remove();
        this.list = this.dom.appendChild(this.createListBox(open.options, cState.id, this.range));
        this.list.addEventListener("scroll", () => {
          if (this.info)
            this.view.requestMeasure(this.placeInfo);
        });
      }
      if (this.updateSelectedOption(open.selected)) {
        if (this.info) {
          this.info.remove();
          this.info = null;
        }
        let {completion} = open.options[open.selected];
        let {info} = completion;
        if (!info)
          return;
        let infoResult = typeof info === "string" ? document.createTextNode(info) : info(completion);
        if (!infoResult)
          return;
        if ("then" in infoResult) {
          infoResult.then((node) => {
            if (node && this.view.state.field(this.stateField, false) == cState)
              this.addInfoPane(node);
          }).catch((e) => logException(this.view.state, e, "completion info"));
        } else {
          this.addInfoPane(infoResult);
        }
      }
    }
    addInfoPane(content2) {
      let dom = this.info = document.createElement("div");
      dom.className = "cm-tooltip cm-completionInfo";
      dom.appendChild(content2);
      this.dom.appendChild(dom);
      this.view.requestMeasure(this.placeInfo);
    }
    updateSelectedOption(selected) {
      let set = null;
      for (let opt = this.list.firstChild, i = this.range.from; opt; opt = opt.nextSibling, i++) {
        if (i == selected) {
          if (!opt.hasAttribute("aria-selected")) {
            opt.setAttribute("aria-selected", "true");
            set = opt;
          }
        } else {
          if (opt.hasAttribute("aria-selected"))
            opt.removeAttribute("aria-selected");
        }
      }
      if (set)
        scrollIntoView2(this.list, set);
      return set;
    }
    measureInfo() {
      let sel = this.dom.querySelector("[aria-selected]");
      if (!sel || !this.info)
        return null;
      let listRect = this.dom.getBoundingClientRect();
      let infoRect = this.info.getBoundingClientRect();
      let selRect = sel.getBoundingClientRect();
      let space4 = this.space;
      if (!space4) {
        let win = this.dom.ownerDocument.defaultView || window;
        space4 = {left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight};
      }
      if (selRect.top > Math.min(space4.bottom, listRect.bottom) - 10 || selRect.bottom < Math.max(space4.top, listRect.top) + 10)
        return null;
      let rtl = this.view.textDirection == Direction.RTL, left = rtl, narrow = false, maxWidth;
      let top2 = "", bottom = "";
      let spaceLeft = listRect.left - space4.left, spaceRight = space4.right - listRect.right;
      if (left && spaceLeft < Math.min(infoRect.width, spaceRight))
        left = false;
      else if (!left && spaceRight < Math.min(infoRect.width, spaceLeft))
        left = true;
      if (infoRect.width <= (left ? spaceLeft : spaceRight)) {
        top2 = Math.max(space4.top, Math.min(selRect.top, space4.bottom - infoRect.height)) - listRect.top + "px";
        maxWidth = Math.min(400, left ? spaceLeft : spaceRight) + "px";
      } else {
        narrow = true;
        maxWidth = Math.min(400, (rtl ? listRect.right : space4.right - listRect.left) - 30) + "px";
        let spaceBelow = space4.bottom - listRect.bottom;
        if (spaceBelow >= infoRect.height || spaceBelow > listRect.top)
          top2 = selRect.bottom - listRect.top + "px";
        else
          bottom = listRect.bottom - selRect.top + "px";
      }
      return {
        top: top2,
        bottom,
        maxWidth,
        class: narrow ? rtl ? "left-narrow" : "right-narrow" : left ? "left" : "right"
      };
    }
    positionInfo(pos) {
      if (this.info) {
        if (pos) {
          this.info.style.top = pos.top;
          this.info.style.bottom = pos.bottom;
          this.info.style.maxWidth = pos.maxWidth;
          this.info.className = "cm-tooltip cm-completionInfo cm-completionInfo-" + pos.class;
        } else {
          this.info.style.top = "-1e6px";
        }
      }
    }
    createListBox(options, id2, range) {
      const ul = document.createElement("ul");
      ul.id = id2;
      ul.setAttribute("role", "listbox");
      ul.setAttribute("aria-expanded", "true");
      ul.setAttribute("aria-label", this.view.state.phrase("Completions"));
      for (let i = range.from; i < range.to; i++) {
        let {completion, match} = options[i];
        const li = ul.appendChild(document.createElement("li"));
        li.id = id2 + "-" + i;
        li.setAttribute("role", "option");
        let cls = this.optionClass(completion);
        if (cls)
          li.className = cls;
        for (let source of this.optionContent) {
          let node = source(completion, this.view.state, match);
          if (node)
            li.appendChild(node);
        }
      }
      if (range.from)
        ul.classList.add("cm-completionListIncompleteTop");
      if (range.to < options.length)
        ul.classList.add("cm-completionListIncompleteBottom");
      return ul;
    }
  };
  function completionTooltip(stateField) {
    return (view) => new CompletionTooltip(view, stateField);
  }
  function scrollIntoView2(container, element) {
    let parent = container.getBoundingClientRect();
    let self = element.getBoundingClientRect();
    if (self.top < parent.top)
      container.scrollTop -= parent.top - self.top;
    else if (self.bottom > parent.bottom)
      container.scrollTop += self.bottom - parent.bottom;
  }
  function score(option) {
    return (option.boost || 0) * 100 + (option.apply ? 10 : 0) + (option.info ? 5 : 0) + (option.type ? 1 : 0);
  }
  function sortOptions(active, state) {
    let options = [], i = 0;
    for (let a of active)
      if (a.hasResult()) {
        if (a.result.filter === false) {
          let getMatch = a.result.getMatch;
          for (let option of a.result.options) {
            let match = [1e9 - i++];
            if (getMatch)
              for (let n of getMatch(option))
                match.push(n);
            options.push(new Option(option, a, match));
          }
        } else {
          let matcher = new FuzzyMatcher(state.sliceDoc(a.from, a.to)), match;
          for (let option of a.result.options)
            if (match = matcher.match(option.label)) {
              if (option.boost != null)
                match[0] += option.boost;
              options.push(new Option(option, a, match));
            }
        }
      }
    let result = [], prev = null;
    let compare2 = state.facet(completionConfig).compareCompletions;
    for (let opt of options.sort((a, b) => b.match[0] - a.match[0] || compare2(a.completion, b.completion))) {
      if (!prev || prev.label != opt.completion.label || prev.detail != opt.completion.detail || prev.type != null && opt.completion.type != null && prev.type != opt.completion.type || prev.apply != opt.completion.apply)
        result.push(opt);
      else if (score(opt.completion) > score(prev))
        result[result.length - 1] = opt;
      prev = opt.completion;
    }
    return result;
  }
  var CompletionDialog = class {
    constructor(options, attrs, tooltip, timestamp, selected, disabled) {
      this.options = options;
      this.attrs = attrs;
      this.tooltip = tooltip;
      this.timestamp = timestamp;
      this.selected = selected;
      this.disabled = disabled;
    }
    setSelected(selected, id2) {
      return selected == this.selected || selected >= this.options.length ? this : new CompletionDialog(this.options, makeAttrs(id2, selected), this.tooltip, this.timestamp, selected, this.disabled);
    }
    static build(active, state, id2, prev, conf) {
      let options = sortOptions(active, state);
      if (!options.length) {
        return prev && active.some((a) => a.state == 1) ? new CompletionDialog(prev.options, prev.attrs, prev.tooltip, prev.timestamp, prev.selected, true) : null;
      }
      let selected = state.facet(completionConfig).selectOnOpen ? 0 : -1;
      if (prev && prev.selected != selected && prev.selected != -1) {
        let selectedValue = prev.options[prev.selected].completion;
        for (let i = 0; i < options.length; i++)
          if (options[i].completion == selectedValue) {
            selected = i;
            break;
          }
      }
      return new CompletionDialog(options, makeAttrs(id2, selected), {
        pos: active.reduce((a, b) => b.hasResult() ? Math.min(a, b.from) : a, 1e8),
        create: completionTooltip(completionState),
        above: conf.aboveCursor
      }, prev ? prev.timestamp : Date.now(), selected, false);
    }
    map(changes) {
      return new CompletionDialog(this.options, this.attrs, Object.assign(Object.assign({}, this.tooltip), {pos: changes.mapPos(this.tooltip.pos)}), this.timestamp, this.selected, this.disabled);
    }
  };
  var CompletionState = class {
    constructor(active, id2, open) {
      this.active = active;
      this.id = id2;
      this.open = open;
    }
    static start() {
      return new CompletionState(none3, "cm-ac-" + Math.floor(Math.random() * 2e6).toString(36), null);
    }
    update(tr) {
      let {state} = tr, conf = state.facet(completionConfig);
      let sources = conf.override || state.languageDataAt("autocomplete", cur(state)).map(asSource);
      let active = sources.map((source) => {
        let value = this.active.find((s) => s.source == source) || new ActiveSource(source, this.active.some((a) => a.state != 0) ? 1 : 0);
        return value.update(tr, conf);
      });
      if (active.length == this.active.length && active.every((a, i) => a == this.active[i]))
        active = this.active;
      let open = this.open;
      if (tr.selection || active.some((a) => a.hasResult() && tr.changes.touchesRange(a.from, a.to)) || !sameResults(active, this.active))
        open = CompletionDialog.build(active, state, this.id, this.open, conf);
      else if (open && open.disabled && !active.some((a) => a.state == 1))
        open = null;
      else if (open && tr.docChanged)
        open = open.map(tr.changes);
      if (!open && active.every((a) => a.state != 1) && active.some((a) => a.hasResult()))
        active = active.map((a) => a.hasResult() ? new ActiveSource(a.source, 0) : a);
      for (let effect of tr.effects)
        if (effect.is(setSelectedEffect))
          open = open && open.setSelected(effect.value, this.id);
      return active == this.active && open == this.open ? this : new CompletionState(active, this.id, open);
    }
    get tooltip() {
      return this.open ? this.open.tooltip : null;
    }
    get attrs() {
      return this.open ? this.open.attrs : baseAttrs;
    }
  };
  function sameResults(a, b) {
    if (a == b)
      return true;
    for (let iA = 0, iB = 0; ; ) {
      while (iA < a.length && !a[iA].hasResult)
        iA++;
      while (iB < b.length && !b[iB].hasResult)
        iB++;
      let endA = iA == a.length, endB = iB == b.length;
      if (endA || endB)
        return endA == endB;
      if (a[iA++].result != b[iB++].result)
        return false;
    }
  }
  var baseAttrs = {
    "aria-autocomplete": "list"
  };
  function makeAttrs(id2, selected) {
    let result = {
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      "aria-controls": id2
    };
    if (selected > -1)
      result["aria-activedescendant"] = id2 + "-" + selected;
    return result;
  }
  var none3 = [];
  function getUserEvent(tr) {
    return tr.isUserEvent("input.type") ? "input" : tr.isUserEvent("delete.backward") ? "delete" : null;
  }
  var ActiveSource = class {
    constructor(source, state, explicitPos = -1) {
      this.source = source;
      this.state = state;
      this.explicitPos = explicitPos;
    }
    hasResult() {
      return false;
    }
    update(tr, conf) {
      let event = getUserEvent(tr), value = this;
      if (event)
        value = value.handleUserEvent(tr, event, conf);
      else if (tr.docChanged)
        value = value.handleChange(tr);
      else if (tr.selection && value.state != 0)
        value = new ActiveSource(value.source, 0);
      for (let effect of tr.effects) {
        if (effect.is(startCompletionEffect))
          value = new ActiveSource(value.source, 1, effect.value ? cur(tr.state) : -1);
        else if (effect.is(closeCompletionEffect))
          value = new ActiveSource(value.source, 0);
        else if (effect.is(setActiveEffect)) {
          for (let active of effect.value)
            if (active.source == value.source)
              value = active;
        }
      }
      return value;
    }
    handleUserEvent(tr, type, conf) {
      return type == "delete" || !conf.activateOnTyping ? this.map(tr.changes) : new ActiveSource(this.source, 1);
    }
    handleChange(tr) {
      return tr.changes.touchesRange(cur(tr.startState)) ? new ActiveSource(this.source, 0) : this.map(tr.changes);
    }
    map(changes) {
      return changes.empty || this.explicitPos < 0 ? this : new ActiveSource(this.source, this.state, changes.mapPos(this.explicitPos));
    }
  };
  var ActiveResult = class extends ActiveSource {
    constructor(source, explicitPos, result, from, to) {
      super(source, 2, explicitPos);
      this.result = result;
      this.from = from;
      this.to = to;
    }
    hasResult() {
      return true;
    }
    handleUserEvent(tr, type, conf) {
      var _a2;
      let from = tr.changes.mapPos(this.from), to = tr.changes.mapPos(this.to, 1);
      let pos = cur(tr.state);
      if ((this.explicitPos < 0 ? pos <= from : pos < this.from) || pos > to || type == "delete" && cur(tr.startState) == this.from)
        return new ActiveSource(this.source, type == "input" && conf.activateOnTyping ? 1 : 0);
      let explicitPos = this.explicitPos < 0 ? -1 : tr.changes.mapPos(this.explicitPos), updated;
      if (checkValid(this.result.validFor, tr.state, from, to))
        return new ActiveResult(this.source, explicitPos, this.result, from, to);
      if (this.result.update && (updated = this.result.update(this.result, from, to, new CompletionContext(tr.state, pos, explicitPos >= 0))))
        return new ActiveResult(this.source, explicitPos, updated, updated.from, (_a2 = updated.to) !== null && _a2 !== void 0 ? _a2 : cur(tr.state));
      return new ActiveSource(this.source, 1, explicitPos);
    }
    handleChange(tr) {
      return tr.changes.touchesRange(this.from, this.to) ? new ActiveSource(this.source, 0) : this.map(tr.changes);
    }
    map(mapping) {
      return mapping.empty ? this : new ActiveResult(this.source, this.explicitPos < 0 ? -1 : mapping.mapPos(this.explicitPos), this.result, mapping.mapPos(this.from), mapping.mapPos(this.to, 1));
    }
  };
  function checkValid(validFor, state, from, to) {
    if (!validFor)
      return false;
    let text = state.sliceDoc(from, to);
    return typeof validFor == "function" ? validFor(text, from, to, state) : ensureAnchor(validFor, true).test(text);
  }
  var startCompletionEffect = /* @__PURE__ */ StateEffect.define();
  var closeCompletionEffect = /* @__PURE__ */ StateEffect.define();
  var setActiveEffect = /* @__PURE__ */ StateEffect.define({
    map(sources, mapping) {
      return sources.map((s) => s.map(mapping));
    }
  });
  var setSelectedEffect = /* @__PURE__ */ StateEffect.define();
  var completionState = /* @__PURE__ */ StateField.define({
    create() {
      return CompletionState.start();
    },
    update(value, tr) {
      return value.update(tr);
    },
    provide: (f) => [
      showTooltip.from(f, (val) => val.tooltip),
      EditorView.contentAttributes.from(f, (state) => state.attrs)
    ]
  });
  function moveCompletionSelection(forward, by = "option") {
    return (view) => {
      let cState = view.state.field(completionState, false);
      if (!cState || !cState.open || cState.open.disabled || Date.now() - cState.open.timestamp < view.state.facet(completionConfig).interactionDelay)
        return false;
      let step = 1, tooltip;
      if (by == "page" && (tooltip = getTooltip(view, cState.open.tooltip)))
        step = Math.max(2, Math.floor(tooltip.dom.offsetHeight / tooltip.dom.querySelector("li").offsetHeight) - 1);
      let {length} = cState.open.options;
      let selected = cState.open.selected > -1 ? cState.open.selected + step * (forward ? 1 : -1) : forward ? 0 : length - 1;
      if (selected < 0)
        selected = by == "page" ? 0 : length - 1;
      else if (selected >= length)
        selected = by == "page" ? length - 1 : 0;
      view.dispatch({effects: setSelectedEffect.of(selected)});
      return true;
    };
  }
  var acceptCompletion = (view) => {
    let cState = view.state.field(completionState, false);
    if (view.state.readOnly || !cState || !cState.open || cState.open.selected < 0 || Date.now() - cState.open.timestamp < view.state.facet(completionConfig).interactionDelay)
      return false;
    if (!cState.open.disabled)
      applyCompletion(view, cState.open.options[cState.open.selected]);
    return true;
  };
  var startCompletion = (view) => {
    let cState = view.state.field(completionState, false);
    if (!cState)
      return false;
    view.dispatch({effects: startCompletionEffect.of(true)});
    return true;
  };
  var closeCompletion = (view) => {
    let cState = view.state.field(completionState, false);
    if (!cState || !cState.active.some((a) => a.state != 0))
      return false;
    view.dispatch({effects: closeCompletionEffect.of(null)});
    return true;
  };
  var RunningQuery = class {
    constructor(active, context) {
      this.active = active;
      this.context = context;
      this.time = Date.now();
      this.updates = [];
      this.done = void 0;
    }
  };
  var DebounceTime = 50;
  var MaxUpdateCount = 50;
  var MinAbortTime = 1e3;
  var completionPlugin = /* @__PURE__ */ ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.debounceUpdate = -1;
      this.running = [];
      this.debounceAccept = -1;
      this.composing = 0;
      for (let active of view.state.field(completionState).active)
        if (active.state == 1)
          this.startQuery(active);
    }
    update(update) {
      let cState = update.state.field(completionState);
      if (!update.selectionSet && !update.docChanged && update.startState.field(completionState) == cState)
        return;
      let doesReset = update.transactions.some((tr) => {
        return (tr.selection || tr.docChanged) && !getUserEvent(tr);
      });
      for (let i = 0; i < this.running.length; i++) {
        let query = this.running[i];
        if (doesReset || query.updates.length + update.transactions.length > MaxUpdateCount && Date.now() - query.time > MinAbortTime) {
          for (let handler of query.context.abortListeners) {
            try {
              handler();
            } catch (e) {
              logException(this.view.state, e);
            }
          }
          query.context.abortListeners = null;
          this.running.splice(i--, 1);
        } else {
          query.updates.push(...update.transactions);
        }
      }
      if (this.debounceUpdate > -1)
        clearTimeout(this.debounceUpdate);
      this.debounceUpdate = cState.active.some((a) => a.state == 1 && !this.running.some((q) => q.active.source == a.source)) ? setTimeout(() => this.startUpdate(), DebounceTime) : -1;
      if (this.composing != 0)
        for (let tr of update.transactions) {
          if (getUserEvent(tr) == "input")
            this.composing = 2;
          else if (this.composing == 2 && tr.selection)
            this.composing = 3;
        }
    }
    startUpdate() {
      this.debounceUpdate = -1;
      let {state} = this.view, cState = state.field(completionState);
      for (let active of cState.active) {
        if (active.state == 1 && !this.running.some((r) => r.active.source == active.source))
          this.startQuery(active);
      }
    }
    startQuery(active) {
      let {state} = this.view, pos = cur(state);
      let context = new CompletionContext(state, pos, active.explicitPos == pos);
      let pending = new RunningQuery(active, context);
      this.running.push(pending);
      Promise.resolve(active.source(context)).then((result) => {
        if (!pending.context.aborted) {
          pending.done = result || null;
          this.scheduleAccept();
        }
      }, (err) => {
        this.view.dispatch({effects: closeCompletionEffect.of(null)});
        logException(this.view.state, err);
      });
    }
    scheduleAccept() {
      if (this.running.every((q) => q.done !== void 0))
        this.accept();
      else if (this.debounceAccept < 0)
        this.debounceAccept = setTimeout(() => this.accept(), DebounceTime);
    }
    accept() {
      var _a2;
      if (this.debounceAccept > -1)
        clearTimeout(this.debounceAccept);
      this.debounceAccept = -1;
      let updated = [];
      let conf = this.view.state.facet(completionConfig);
      for (let i = 0; i < this.running.length; i++) {
        let query = this.running[i];
        if (query.done === void 0)
          continue;
        this.running.splice(i--, 1);
        if (query.done) {
          let active = new ActiveResult(query.active.source, query.active.explicitPos, query.done, query.done.from, (_a2 = query.done.to) !== null && _a2 !== void 0 ? _a2 : cur(query.updates.length ? query.updates[0].startState : this.view.state));
          for (let tr of query.updates)
            active = active.update(tr, conf);
          if (active.hasResult()) {
            updated.push(active);
            continue;
          }
        }
        let current = this.view.state.field(completionState).active.find((a) => a.source == query.active.source);
        if (current && current.state == 1) {
          if (query.done == null) {
            let active = new ActiveSource(query.active.source, 0);
            for (let tr of query.updates)
              active = active.update(tr, conf);
            if (active.state != 1)
              updated.push(active);
          } else {
            this.startQuery(current);
          }
        }
      }
      if (updated.length)
        this.view.dispatch({effects: setActiveEffect.of(updated)});
    }
  }, {
    eventHandlers: {
      blur() {
        let state = this.view.state.field(completionState, false);
        if (state && state.tooltip && this.view.state.facet(completionConfig).closeOnBlur)
          this.view.dispatch({effects: closeCompletionEffect.of(null)});
      },
      compositionstart() {
        this.composing = 1;
      },
      compositionend() {
        if (this.composing == 3) {
          setTimeout(() => this.view.dispatch({effects: startCompletionEffect.of(false)}), 20);
        }
        this.composing = 0;
      }
    }
  });
  var baseTheme2 = /* @__PURE__ */ EditorView.baseTheme({
    ".cm-tooltip.cm-tooltip-autocomplete": {
      "& > ul": {
        fontFamily: "monospace",
        whiteSpace: "nowrap",
        overflow: "hidden auto",
        maxWidth_fallback: "700px",
        maxWidth: "min(700px, 95vw)",
        minWidth: "250px",
        maxHeight: "10em",
        listStyle: "none",
        margin: 0,
        padding: 0,
        "& > li": {
          overflowX: "hidden",
          textOverflow: "ellipsis",
          cursor: "pointer",
          padding: "1px 3px",
          lineHeight: 1.2
        }
      }
    },
    "&light .cm-tooltip-autocomplete ul li[aria-selected]": {
      background: "#17c",
      color: "white"
    },
    "&light .cm-tooltip-autocomplete-disabled ul li[aria-selected]": {
      background: "#777"
    },
    "&dark .cm-tooltip-autocomplete ul li[aria-selected]": {
      background: "#347",
      color: "white"
    },
    "&dark .cm-tooltip-autocomplete-disabled ul li[aria-selected]": {
      background: "#444"
    },
    ".cm-completionListIncompleteTop:before, .cm-completionListIncompleteBottom:after": {
      content: '"\xB7\xB7\xB7"',
      opacity: 0.5,
      display: "block",
      textAlign: "center"
    },
    ".cm-tooltip.cm-completionInfo": {
      position: "absolute",
      padding: "3px 9px",
      width: "max-content",
      maxWidth: `${400}px`,
      boxSizing: "border-box"
    },
    ".cm-completionInfo.cm-completionInfo-left": {right: "100%"},
    ".cm-completionInfo.cm-completionInfo-right": {left: "100%"},
    ".cm-completionInfo.cm-completionInfo-left-narrow": {right: `${30}px`},
    ".cm-completionInfo.cm-completionInfo-right-narrow": {left: `${30}px`},
    "&light .cm-snippetField": {backgroundColor: "#00000022"},
    "&dark .cm-snippetField": {backgroundColor: "#ffffff22"},
    ".cm-snippetFieldPosition": {
      verticalAlign: "text-top",
      width: 0,
      height: "1.15em",
      display: "inline-block",
      margin: "0 -0.7px -.7em",
      borderLeft: "1.4px dotted #888"
    },
    ".cm-completionMatchedText": {
      textDecoration: "underline"
    },
    ".cm-completionDetail": {
      marginLeft: "0.5em",
      fontStyle: "italic"
    },
    ".cm-completionIcon": {
      fontSize: "90%",
      width: ".8em",
      display: "inline-block",
      textAlign: "center",
      paddingRight: ".6em",
      opacity: "0.6"
    },
    ".cm-completionIcon-function, .cm-completionIcon-method": {
      "&:after": {content: "'\u0192'"}
    },
    ".cm-completionIcon-class": {
      "&:after": {content: "'\u25CB'"}
    },
    ".cm-completionIcon-interface": {
      "&:after": {content: "'\u25CC'"}
    },
    ".cm-completionIcon-variable": {
      "&:after": {content: "'\u{1D465}'"}
    },
    ".cm-completionIcon-constant": {
      "&:after": {content: "'\u{1D436}'"}
    },
    ".cm-completionIcon-type": {
      "&:after": {content: "'\u{1D461}'"}
    },
    ".cm-completionIcon-enum": {
      "&:after": {content: "'\u222A'"}
    },
    ".cm-completionIcon-property": {
      "&:after": {content: "'\u25A1'"}
    },
    ".cm-completionIcon-keyword": {
      "&:after": {content: "'\u{1F511}\uFE0E'"}
    },
    ".cm-completionIcon-namespace": {
      "&:after": {content: "'\u25A2'"}
    },
    ".cm-completionIcon-text": {
      "&:after": {content: "'abc'", fontSize: "50%", verticalAlign: "middle"}
    }
  });
  var FieldPos = class {
    constructor(field, line, from, to) {
      this.field = field;
      this.line = line;
      this.from = from;
      this.to = to;
    }
  };
  var FieldRange = class {
    constructor(field, from, to) {
      this.field = field;
      this.from = from;
      this.to = to;
    }
    map(changes) {
      let from = changes.mapPos(this.from, -1, MapMode.TrackDel);
      let to = changes.mapPos(this.to, 1, MapMode.TrackDel);
      return from == null || to == null ? null : new FieldRange(this.field, from, to);
    }
  };
  var Snippet = class {
    constructor(lines, fieldPositions) {
      this.lines = lines;
      this.fieldPositions = fieldPositions;
    }
    instantiate(state, pos) {
      let text = [], lineStart = [pos];
      let lineObj = state.doc.lineAt(pos), baseIndent = /^\s*/.exec(lineObj.text)[0];
      for (let line of this.lines) {
        if (text.length) {
          let indent = baseIndent, tabs = /^\t*/.exec(line)[0].length;
          for (let i = 0; i < tabs; i++)
            indent += state.facet(indentUnit);
          lineStart.push(pos + indent.length - tabs);
          line = indent + line.slice(tabs);
        }
        text.push(line);
        pos += line.length + 1;
      }
      let ranges = this.fieldPositions.map((pos2) => new FieldRange(pos2.field, lineStart[pos2.line] + pos2.from, lineStart[pos2.line] + pos2.to));
      return {text, ranges};
    }
    static parse(template2) {
      let fields = [];
      let lines = [], positions = [], m;
      for (let line of template2.split(/\r\n?|\n/)) {
        while (m = /[#$]\{(?:(\d+)(?::([^}]*))?|([^}]*))\}/.exec(line)) {
          let seq = m[1] ? +m[1] : null, name2 = m[2] || m[3] || "", found = -1;
          for (let i = 0; i < fields.length; i++) {
            if (seq != null ? fields[i].seq == seq : name2 ? fields[i].name == name2 : false)
              found = i;
          }
          if (found < 0) {
            let i = 0;
            while (i < fields.length && (seq == null || fields[i].seq != null && fields[i].seq < seq))
              i++;
            fields.splice(i, 0, {seq, name: name2});
            found = i;
            for (let pos of positions)
              if (pos.field >= found)
                pos.field++;
          }
          positions.push(new FieldPos(found, lines.length, m.index, m.index + name2.length));
          line = line.slice(0, m.index) + name2 + line.slice(m.index + m[0].length);
        }
        for (let esc; esc = /([$#])\\{/.exec(line); ) {
          line = line.slice(0, esc.index) + esc[1] + "{" + line.slice(esc.index + esc[0].length);
          for (let pos of positions)
            if (pos.line == lines.length && pos.from > esc.index) {
              pos.from--;
              pos.to--;
            }
        }
        lines.push(line);
      }
      return new Snippet(lines, positions);
    }
  };
  var fieldMarker = /* @__PURE__ */ Decoration.widget({widget: /* @__PURE__ */ new class extends WidgetType {
    toDOM() {
      let span = document.createElement("span");
      span.className = "cm-snippetFieldPosition";
      return span;
    }
    ignoreEvent() {
      return false;
    }
  }()});
  var fieldRange = /* @__PURE__ */ Decoration.mark({class: "cm-snippetField"});
  var ActiveSnippet = class {
    constructor(ranges, active) {
      this.ranges = ranges;
      this.active = active;
      this.deco = Decoration.set(ranges.map((r) => (r.from == r.to ? fieldMarker : fieldRange).range(r.from, r.to)));
    }
    map(changes) {
      let ranges = [];
      for (let r of this.ranges) {
        let mapped = r.map(changes);
        if (!mapped)
          return null;
        ranges.push(mapped);
      }
      return new ActiveSnippet(ranges, this.active);
    }
    selectionInsideField(sel) {
      return sel.ranges.every((range) => this.ranges.some((r) => r.field == this.active && r.from <= range.from && r.to >= range.to));
    }
  };
  var setActive = /* @__PURE__ */ StateEffect.define({
    map(value, changes) {
      return value && value.map(changes);
    }
  });
  var moveToField = /* @__PURE__ */ StateEffect.define();
  var snippetState = /* @__PURE__ */ StateField.define({
    create() {
      return null;
    },
    update(value, tr) {
      for (let effect of tr.effects) {
        if (effect.is(setActive))
          return effect.value;
        if (effect.is(moveToField) && value)
          return new ActiveSnippet(value.ranges, effect.value);
      }
      if (value && tr.docChanged)
        value = value.map(tr.changes);
      if (value && tr.selection && !value.selectionInsideField(tr.selection))
        value = null;
      return value;
    },
    provide: (f) => EditorView.decorations.from(f, (val) => val ? val.deco : Decoration.none)
  });
  function fieldSelection(ranges, field) {
    return EditorSelection.create(ranges.filter((r) => r.field == field).map((r) => EditorSelection.range(r.from, r.to)));
  }
  function snippet(template2) {
    let snippet2 = Snippet.parse(template2);
    return (editor, _completion, from, to) => {
      let {text, ranges} = snippet2.instantiate(editor.state, from);
      let spec = {
        changes: {from, to, insert: Text.of(text)},
        scrollIntoView: true
      };
      if (ranges.length)
        spec.selection = fieldSelection(ranges, 0);
      if (ranges.length > 1) {
        let active = new ActiveSnippet(ranges, 0);
        let effects = spec.effects = [setActive.of(active)];
        if (editor.state.field(snippetState, false) === void 0)
          effects.push(StateEffect.appendConfig.of([snippetState, addSnippetKeymap, snippetPointerHandler, baseTheme2]));
      }
      editor.dispatch(editor.state.update(spec));
    };
  }
  function moveField(dir) {
    return ({state, dispatch}) => {
      let active = state.field(snippetState, false);
      if (!active || dir < 0 && active.active == 0)
        return false;
      let next = active.active + dir, last = dir > 0 && !active.ranges.some((r) => r.field == next + dir);
      dispatch(state.update({
        selection: fieldSelection(active.ranges, next),
        effects: setActive.of(last ? null : new ActiveSnippet(active.ranges, next))
      }));
      return true;
    };
  }
  var clearSnippet = ({state, dispatch}) => {
    let active = state.field(snippetState, false);
    if (!active)
      return false;
    dispatch(state.update({effects: setActive.of(null)}));
    return true;
  };
  var nextSnippetField = /* @__PURE__ */ moveField(1);
  var prevSnippetField = /* @__PURE__ */ moveField(-1);
  var defaultSnippetKeymap = [
    {key: "Tab", run: nextSnippetField, shift: prevSnippetField},
    {key: "Escape", run: clearSnippet}
  ];
  var snippetKeymap = /* @__PURE__ */ Facet.define({
    combine(maps) {
      return maps.length ? maps[0] : defaultSnippetKeymap;
    }
  });
  var addSnippetKeymap = /* @__PURE__ */ Prec.highest(/* @__PURE__ */ keymap.compute([snippetKeymap], (state) => state.facet(snippetKeymap)));
  function snippetCompletion(template2, completion) {
    return Object.assign(Object.assign({}, completion), {apply: snippet(template2)});
  }
  var snippetPointerHandler = /* @__PURE__ */ EditorView.domEventHandlers({
    mousedown(event, view) {
      let active = view.state.field(snippetState, false), pos;
      if (!active || (pos = view.posAtCoords({x: event.clientX, y: event.clientY})) == null)
        return false;
      let match = active.ranges.find((r) => r.from <= pos && r.to >= pos);
      if (!match || match.field == active.active)
        return false;
      view.dispatch({
        selection: fieldSelection(active.ranges, match.field),
        effects: setActive.of(active.ranges.some((r) => r.field > match.field) ? new ActiveSnippet(active.ranges, match.field) : null)
      });
      return true;
    }
  });
  var closedBracket = /* @__PURE__ */ new class extends RangeValue {
  }();
  closedBracket.startSide = 1;
  closedBracket.endSide = -1;
  var android = typeof navigator == "object" && /* @__PURE__ */ /Android\b/.test(navigator.userAgent);
  function autocompletion(config = {}) {
    return [
      completionState,
      completionConfig.of(config),
      completionPlugin,
      completionKeymapExt,
      baseTheme2
    ];
  }
  var completionKeymap = [
    {key: "Ctrl-Space", run: startCompletion},
    {key: "Escape", run: closeCompletion},
    {key: "ArrowDown", run: /* @__PURE__ */ moveCompletionSelection(true)},
    {key: "ArrowUp", run: /* @__PURE__ */ moveCompletionSelection(false)},
    {key: "PageDown", run: /* @__PURE__ */ moveCompletionSelection(true, "page")},
    {key: "PageUp", run: /* @__PURE__ */ moveCompletionSelection(false, "page")},
    {key: "Enter", run: acceptCompletion}
  ];
  var completionKeymapExt = /* @__PURE__ */ Prec.highest(/* @__PURE__ */ keymap.computeN([completionConfig], (state) => state.facet(completionConfig).defaultKeymap ? [completionKeymap] : []));

  // node_modules/@lezer/lr/dist/index.js
  var Stack = class {
    constructor(p, stack, state, reducePos, pos, score2, buffer, bufferBase, curContext, lookAhead = 0, parent) {
      this.p = p;
      this.stack = stack;
      this.state = state;
      this.reducePos = reducePos;
      this.pos = pos;
      this.score = score2;
      this.buffer = buffer;
      this.bufferBase = bufferBase;
      this.curContext = curContext;
      this.lookAhead = lookAhead;
      this.parent = parent;
    }
    toString() {
      return `[${this.stack.filter((_, i) => i % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
    }
    static start(p, state, pos = 0) {
      let cx = p.parser.context;
      return new Stack(p, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
    }
    get context() {
      return this.curContext ? this.curContext.context : null;
    }
    pushState(state, start) {
      this.stack.push(this.state, start, this.bufferBase + this.buffer.length);
      this.state = state;
    }
    reduce(action) {
      let depth = action >> 19, type = action & 65535;
      let {parser: parser7} = this.p;
      let dPrec = parser7.dynamicPrecedence(type);
      if (dPrec)
        this.score += dPrec;
      if (depth == 0) {
        this.pushState(parser7.getGoto(this.state, type, true), this.reducePos);
        if (type < parser7.minRepeatTerm)
          this.storeNode(type, this.reducePos, this.reducePos, 4, true);
        this.reduceContext(type, this.reducePos);
        return;
      }
      let base2 = this.stack.length - (depth - 1) * 3 - (action & 262144 ? 6 : 0);
      let start = this.stack[base2 - 2];
      let bufferBase = this.stack[base2 - 1], count = this.bufferBase + this.buffer.length - bufferBase;
      if (type < parser7.minRepeatTerm || action & 131072) {
        let pos = parser7.stateFlag(this.state, 1) ? this.pos : this.reducePos;
        this.storeNode(type, start, pos, count + 4, true);
      }
      if (action & 262144) {
        this.state = this.stack[base2];
      } else {
        let baseStateID = this.stack[base2 - 3];
        this.state = parser7.getGoto(baseStateID, type, true);
      }
      while (this.stack.length > base2)
        this.stack.pop();
      this.reduceContext(type, start);
    }
    storeNode(term, start, end, size = 4, isReduce = false) {
      if (term == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
        let cur2 = this, top2 = this.buffer.length;
        if (top2 == 0 && cur2.parent) {
          top2 = cur2.bufferBase - cur2.parent.bufferBase;
          cur2 = cur2.parent;
        }
        if (top2 > 0 && cur2.buffer[top2 - 4] == 0 && cur2.buffer[top2 - 1] > -1) {
          if (start == end)
            return;
          if (cur2.buffer[top2 - 2] >= start) {
            cur2.buffer[top2 - 2] = end;
            return;
          }
        }
      }
      if (!isReduce || this.pos == end) {
        this.buffer.push(term, start, end, size);
      } else {
        let index = this.buffer.length;
        if (index > 0 && this.buffer[index - 4] != 0)
          while (index > 0 && this.buffer[index - 2] > end) {
            this.buffer[index] = this.buffer[index - 4];
            this.buffer[index + 1] = this.buffer[index - 3];
            this.buffer[index + 2] = this.buffer[index - 2];
            this.buffer[index + 3] = this.buffer[index - 1];
            index -= 4;
            if (size > 4)
              size -= 4;
          }
        this.buffer[index] = term;
        this.buffer[index + 1] = start;
        this.buffer[index + 2] = end;
        this.buffer[index + 3] = size;
      }
    }
    shift(action, next, nextEnd) {
      let start = this.pos;
      if (action & 131072) {
        this.pushState(action & 65535, this.pos);
      } else if ((action & 262144) == 0) {
        let nextState = action, {parser: parser7} = this.p;
        if (nextEnd > this.pos || next <= parser7.maxNode) {
          this.pos = nextEnd;
          if (!parser7.stateFlag(nextState, 1))
            this.reducePos = nextEnd;
        }
        this.pushState(nextState, start);
        this.shiftContext(next, start);
        if (next <= parser7.maxNode)
          this.buffer.push(next, start, nextEnd, 4);
      } else {
        this.pos = nextEnd;
        this.shiftContext(next, start);
        if (next <= this.p.parser.maxNode)
          this.buffer.push(next, start, nextEnd, 4);
      }
    }
    apply(action, next, nextEnd) {
      if (action & 65536)
        this.reduce(action);
      else
        this.shift(action, next, nextEnd);
    }
    useNode(value, next) {
      let index = this.p.reused.length - 1;
      if (index < 0 || this.p.reused[index] != value) {
        this.p.reused.push(value);
        index++;
      }
      let start = this.pos;
      this.reducePos = this.pos = start + value.length;
      this.pushState(next, start);
      this.buffer.push(index, start, this.reducePos, -1);
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
    }
    split() {
      let parent = this;
      let off = parent.buffer.length;
      while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
        off -= 4;
      let buffer = parent.buffer.slice(off), base2 = parent.bufferBase + off;
      while (parent && base2 == parent.bufferBase)
        parent = parent.parent;
      return new Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base2, this.curContext, this.lookAhead, parent);
    }
    recoverByDelete(next, nextEnd) {
      let isNode = next <= this.p.parser.maxNode;
      if (isNode)
        this.storeNode(next, this.pos, nextEnd, 4);
      this.storeNode(0, this.pos, nextEnd, isNode ? 8 : 4);
      this.pos = this.reducePos = nextEnd;
      this.score -= 190;
    }
    canShift(term) {
      for (let sim = new SimulatedStack(this); ; ) {
        let action = this.p.parser.stateSlot(sim.state, 4) || this.p.parser.hasAction(sim.state, term);
        if ((action & 65536) == 0)
          return true;
        if (action == 0)
          return false;
        sim.reduce(action);
      }
    }
    recoverByInsert(next) {
      if (this.stack.length >= 300)
        return [];
      let nextStates = this.p.parser.nextStates(this.state);
      if (nextStates.length > 4 << 1 || this.stack.length >= 120) {
        let best = [];
        for (let i = 0, s; i < nextStates.length; i += 2) {
          if ((s = nextStates[i + 1]) != this.state && this.p.parser.hasAction(s, next))
            best.push(nextStates[i], s);
        }
        if (this.stack.length < 120)
          for (let i = 0; best.length < 4 << 1 && i < nextStates.length; i += 2) {
            let s = nextStates[i + 1];
            if (!best.some((v, i2) => i2 & 1 && v == s))
              best.push(nextStates[i], s);
          }
        nextStates = best;
      }
      let result = [];
      for (let i = 0; i < nextStates.length && result.length < 4; i += 2) {
        let s = nextStates[i + 1];
        if (s == this.state)
          continue;
        let stack = this.split();
        stack.pushState(s, this.pos);
        stack.storeNode(0, stack.pos, stack.pos, 4, true);
        stack.shiftContext(nextStates[i], this.pos);
        stack.score -= 200;
        result.push(stack);
      }
      return result;
    }
    forceReduce() {
      let reduce = this.p.parser.stateSlot(this.state, 5);
      if ((reduce & 65536) == 0)
        return false;
      let {parser: parser7} = this.p;
      if (!parser7.validAction(this.state, reduce)) {
        let depth = reduce >> 19, term = reduce & 65535;
        let target = this.stack.length - depth * 3;
        if (target < 0 || parser7.getGoto(this.stack[target], term, false) < 0)
          return false;
        this.storeNode(0, this.reducePos, this.reducePos, 4, true);
        this.score -= 100;
      }
      this.reducePos = this.pos;
      this.reduce(reduce);
      return true;
    }
    forceAll() {
      while (!this.p.parser.stateFlag(this.state, 2)) {
        if (!this.forceReduce()) {
          this.storeNode(0, this.pos, this.pos, 4, true);
          break;
        }
      }
      return this;
    }
    get deadEnd() {
      if (this.stack.length != 3)
        return false;
      let {parser: parser7} = this.p;
      return parser7.data[parser7.stateSlot(this.state, 1)] == 65535 && !parser7.stateSlot(this.state, 4);
    }
    restart() {
      this.state = this.stack[0];
      this.stack.length = 0;
    }
    sameState(other) {
      if (this.state != other.state || this.stack.length != other.stack.length)
        return false;
      for (let i = 0; i < this.stack.length; i += 3)
        if (this.stack[i] != other.stack[i])
          return false;
      return true;
    }
    get parser() {
      return this.p.parser;
    }
    dialectEnabled(dialectID) {
      return this.p.parser.dialect.flags[dialectID];
    }
    shiftContext(term, start) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start)));
    }
    reduceContext(term, start) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start)));
    }
    emitContext() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -3)
        this.buffer.push(this.curContext.hash, this.reducePos, this.reducePos, -3);
    }
    emitLookAhead() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -4)
        this.buffer.push(this.lookAhead, this.reducePos, this.reducePos, -4);
    }
    updateContext(context) {
      if (context != this.curContext.context) {
        let newCx = new StackContext(this.curContext.tracker, context);
        if (newCx.hash != this.curContext.hash)
          this.emitContext();
        this.curContext = newCx;
      }
    }
    setLookAhead(lookAhead) {
      if (lookAhead > this.lookAhead) {
        this.emitLookAhead();
        this.lookAhead = lookAhead;
      }
    }
    close() {
      if (this.curContext && this.curContext.tracker.strict)
        this.emitContext();
      if (this.lookAhead > 0)
        this.emitLookAhead();
    }
  };
  var StackContext = class {
    constructor(tracker, context) {
      this.tracker = tracker;
      this.context = context;
      this.hash = tracker.strict ? tracker.hash(context) : 0;
    }
  };
  var Recover;
  (function(Recover2) {
    Recover2[Recover2["Insert"] = 200] = "Insert";
    Recover2[Recover2["Delete"] = 190] = "Delete";
    Recover2[Recover2["Reduce"] = 100] = "Reduce";
    Recover2[Recover2["MaxNext"] = 4] = "MaxNext";
    Recover2[Recover2["MaxInsertStackDepth"] = 300] = "MaxInsertStackDepth";
    Recover2[Recover2["DampenInsertStackDepth"] = 120] = "DampenInsertStackDepth";
  })(Recover || (Recover = {}));
  var SimulatedStack = class {
    constructor(start) {
      this.start = start;
      this.state = start.state;
      this.stack = start.stack;
      this.base = this.stack.length;
    }
    reduce(action) {
      let term = action & 65535, depth = action >> 19;
      if (depth == 0) {
        if (this.stack == this.start.stack)
          this.stack = this.stack.slice();
        this.stack.push(this.state, 0, 0);
        this.base += 3;
      } else {
        this.base -= (depth - 1) * 3;
      }
      let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
      this.state = goto;
    }
  };
  var StackBufferCursor = class {
    constructor(stack, pos, index) {
      this.stack = stack;
      this.pos = pos;
      this.index = index;
      this.buffer = stack.buffer;
      if (this.index == 0)
        this.maybeNext();
    }
    static create(stack, pos = stack.bufferBase + stack.buffer.length) {
      return new StackBufferCursor(stack, pos, pos - stack.bufferBase);
    }
    maybeNext() {
      let next = this.stack.parent;
      if (next != null) {
        this.index = this.stack.bufferBase - next.bufferBase;
        this.stack = next;
        this.buffer = next.buffer;
      }
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    next() {
      this.index -= 4;
      this.pos -= 4;
      if (this.index == 0)
        this.maybeNext();
    }
    fork() {
      return new StackBufferCursor(this.stack, this.pos, this.index);
    }
  };
  var CachedToken = class {
    constructor() {
      this.start = -1;
      this.value = -1;
      this.end = -1;
      this.extended = -1;
      this.lookAhead = 0;
      this.mask = 0;
      this.context = 0;
    }
  };
  var nullToken = new CachedToken();
  var InputStream = class {
    constructor(input, ranges) {
      this.input = input;
      this.ranges = ranges;
      this.chunk = "";
      this.chunkOff = 0;
      this.chunk2 = "";
      this.chunk2Pos = 0;
      this.next = -1;
      this.token = nullToken;
      this.rangeIndex = 0;
      this.pos = this.chunkPos = ranges[0].from;
      this.range = ranges[0];
      this.end = ranges[ranges.length - 1].to;
      this.readNext();
    }
    resolveOffset(offset, assoc) {
      let range = this.range, index = this.rangeIndex;
      let pos = this.pos + offset;
      while (pos < range.from) {
        if (!index)
          return null;
        let next = this.ranges[--index];
        pos -= range.from - next.to;
        range = next;
      }
      while (assoc < 0 ? pos > range.to : pos >= range.to) {
        if (index == this.ranges.length - 1)
          return null;
        let next = this.ranges[++index];
        pos += next.from - range.to;
        range = next;
      }
      return pos;
    }
    clipPos(pos) {
      if (pos >= this.range.from && pos < this.range.to)
        return pos;
      for (let range of this.ranges)
        if (range.to > pos)
          return Math.max(pos, range.from);
      return this.end;
    }
    peek(offset) {
      let idx = this.chunkOff + offset, pos, result;
      if (idx >= 0 && idx < this.chunk.length) {
        pos = this.pos + offset;
        result = this.chunk.charCodeAt(idx);
      } else {
        let resolved = this.resolveOffset(offset, 1);
        if (resolved == null)
          return -1;
        pos = resolved;
        if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
          result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
        } else {
          let i = this.rangeIndex, range = this.range;
          while (range.to <= pos)
            range = this.ranges[++i];
          this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
          if (pos + this.chunk2.length > range.to)
            this.chunk2 = this.chunk2.slice(0, range.to - pos);
          result = this.chunk2.charCodeAt(0);
        }
      }
      if (pos >= this.token.lookAhead)
        this.token.lookAhead = pos + 1;
      return result;
    }
    acceptToken(token, endOffset = 0) {
      let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
      if (end == null || end < this.token.start)
        throw new RangeError("Token end out of bounds");
      this.token.value = token;
      this.token.end = end;
    }
    getChunk() {
      if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
        let {chunk, chunkPos} = this;
        this.chunk = this.chunk2;
        this.chunkPos = this.chunk2Pos;
        this.chunk2 = chunk;
        this.chunk2Pos = chunkPos;
        this.chunkOff = this.pos - this.chunkPos;
      } else {
        this.chunk2 = this.chunk;
        this.chunk2Pos = this.chunkPos;
        let nextChunk = this.input.chunk(this.pos);
        let end = this.pos + nextChunk.length;
        this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
        this.chunkPos = this.pos;
        this.chunkOff = 0;
      }
    }
    readNext() {
      if (this.chunkOff >= this.chunk.length) {
        this.getChunk();
        if (this.chunkOff == this.chunk.length)
          return this.next = -1;
      }
      return this.next = this.chunk.charCodeAt(this.chunkOff);
    }
    advance(n = 1) {
      this.chunkOff += n;
      while (this.pos + n >= this.range.to) {
        if (this.rangeIndex == this.ranges.length - 1)
          return this.setDone();
        n -= this.range.to - this.pos;
        this.range = this.ranges[++this.rangeIndex];
        this.pos = this.range.from;
      }
      this.pos += n;
      if (this.pos >= this.token.lookAhead)
        this.token.lookAhead = this.pos + 1;
      return this.readNext();
    }
    setDone() {
      this.pos = this.chunkPos = this.end;
      this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
      this.chunk = "";
      return this.next = -1;
    }
    reset(pos, token) {
      if (token) {
        this.token = token;
        token.start = pos;
        token.lookAhead = pos + 1;
        token.value = token.extended = -1;
      } else {
        this.token = nullToken;
      }
      if (this.pos != pos) {
        this.pos = pos;
        if (pos == this.end) {
          this.setDone();
          return this;
        }
        while (pos < this.range.from)
          this.range = this.ranges[--this.rangeIndex];
        while (pos >= this.range.to)
          this.range = this.ranges[++this.rangeIndex];
        if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
          this.chunkOff = pos - this.chunkPos;
        } else {
          this.chunk = "";
          this.chunkOff = 0;
        }
        this.readNext();
      }
      return this;
    }
    read(from, to) {
      if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
        return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
      if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
        return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
      if (from >= this.range.from && to <= this.range.to)
        return this.input.read(from, to);
      let result = "";
      for (let r of this.ranges) {
        if (r.from >= to)
          break;
        if (r.to > from)
          result += this.input.read(Math.max(r.from, from), Math.min(r.to, to));
      }
      return result;
    }
  };
  var TokenGroup = class {
    constructor(data2, id2) {
      this.data = data2;
      this.id = id2;
    }
    token(input, stack) {
      readToken(this.data, input, stack, this.id);
    }
  };
  TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
  var ExternalTokenizer = class {
    constructor(token, options = {}) {
      this.token = token;
      this.contextual = !!options.contextual;
      this.fallback = !!options.fallback;
      this.extend = !!options.extend;
    }
  };
  function readToken(data2, input, stack, group) {
    let state = 0, groupMask = 1 << group, {parser: parser7} = stack.p, {dialect} = parser7;
    scan:
      for (; ; ) {
        if ((groupMask & data2[state]) == 0)
          break;
        let accEnd = data2[state + 1];
        for (let i = state + 3; i < accEnd; i += 2)
          if ((data2[i + 1] & groupMask) > 0) {
            let term = data2[i];
            if (dialect.allows(term) && (input.token.value == -1 || input.token.value == term || parser7.overrides(term, input.token.value))) {
              input.acceptToken(term);
              break;
            }
          }
        let next = input.next, low = 0, high = data2[state + 2];
        if (input.next < 0 && high > low && data2[accEnd + high * 3 - 3] == 65535 && data2[accEnd + high * 3 - 3] == 65535) {
          state = data2[accEnd + high * 3 - 1];
          continue scan;
        }
        for (; low < high; ) {
          let mid = low + high >> 1;
          let index = accEnd + mid + (mid << 1);
          let from = data2[index], to = data2[index + 1] || 65536;
          if (next < from)
            high = mid;
          else if (next >= to)
            low = mid + 1;
          else {
            state = data2[index + 2];
            input.advance();
            continue scan;
          }
        }
        break;
      }
  }
  function decodeArray(input, Type2 = Uint16Array) {
    if (typeof input != "string")
      return input;
    let array = null;
    for (let pos = 0, out = 0; pos < input.length; ) {
      let value = 0;
      for (; ; ) {
        let next = input.charCodeAt(pos++), stop = false;
        if (next == 126) {
          value = 65535;
          break;
        }
        if (next >= 92)
          next--;
        if (next >= 34)
          next--;
        let digit = next - 32;
        if (digit >= 46) {
          digit -= 46;
          stop = true;
        }
        value += digit;
        if (stop)
          break;
        value *= 46;
      }
      if (array)
        array[out++] = value;
      else
        array = new Type2(value);
    }
    return array;
  }
  var verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
  var stackIDs = null;
  var Safety;
  (function(Safety2) {
    Safety2[Safety2["Margin"] = 25] = "Margin";
  })(Safety || (Safety = {}));
  function cutAt(tree, pos, side) {
    let cursor = tree.cursor(IterMode.IncludeAnonymous);
    cursor.moveTo(pos);
    for (; ; ) {
      if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
        for (; ; ) {
          if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
            return side < 0 ? Math.max(0, Math.min(cursor.to - 1, pos - 25)) : Math.min(tree.length, Math.max(cursor.from + 1, pos + 25));
          if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
            break;
          if (!cursor.parent())
            return side < 0 ? 0 : tree.length;
        }
    }
  }
  var FragmentCursor2 = class {
    constructor(fragments, nodeSet) {
      this.fragments = fragments;
      this.nodeSet = nodeSet;
      this.i = 0;
      this.fragment = null;
      this.safeFrom = -1;
      this.safeTo = -1;
      this.trees = [];
      this.start = [];
      this.index = [];
      this.nextFragment();
    }
    nextFragment() {
      let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
      if (fr) {
        this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
        this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
        while (this.trees.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
        }
        this.trees.push(fr.tree);
        this.start.push(-fr.offset);
        this.index.push(0);
        this.nextStart = this.safeFrom;
      } else {
        this.nextStart = 1e9;
      }
    }
    nodeAt(pos) {
      if (pos < this.nextStart)
        return null;
      while (this.fragment && this.safeTo <= pos)
        this.nextFragment();
      if (!this.fragment)
        return null;
      for (; ; ) {
        let last = this.trees.length - 1;
        if (last < 0) {
          this.nextFragment();
          return null;
        }
        let top2 = this.trees[last], index = this.index[last];
        if (index == top2.children.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
          continue;
        }
        let next = top2.children[index];
        let start = this.start[last] + top2.positions[index];
        if (start > pos) {
          this.nextStart = start;
          return null;
        }
        if (next instanceof Tree) {
          if (start == pos) {
            if (start < this.safeFrom)
              return null;
            let end = start + next.length;
            if (end <= this.safeTo) {
              let lookAhead = next.prop(NodeProp.lookAhead);
              if (!lookAhead || end + lookAhead < this.fragment.to)
                return next;
            }
          }
          this.index[last]++;
          if (start + next.length >= Math.max(this.safeFrom, pos)) {
            this.trees.push(next);
            this.start.push(start);
            this.index.push(0);
          }
        } else {
          this.index[last]++;
          this.nextStart = start + next.length;
        }
      }
    }
  };
  var TokenCache = class {
    constructor(parser7, stream) {
      this.stream = stream;
      this.tokens = [];
      this.mainToken = null;
      this.actions = [];
      this.tokens = parser7.tokenizers.map((_) => new CachedToken());
    }
    getActions(stack) {
      let actionIndex = 0;
      let main = null;
      let {parser: parser7} = stack.p, {tokenizers} = parser7;
      let mask = parser7.stateSlot(stack.state, 3);
      let context = stack.curContext ? stack.curContext.hash : 0;
      let lookAhead = 0;
      for (let i = 0; i < tokenizers.length; i++) {
        if ((1 << i & mask) == 0)
          continue;
        let tokenizer = tokenizers[i], token = this.tokens[i];
        if (main && !tokenizer.fallback)
          continue;
        if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
          this.updateCachedToken(token, tokenizer, stack);
          token.mask = mask;
          token.context = context;
        }
        if (token.lookAhead > token.end + 25)
          lookAhead = Math.max(token.lookAhead, lookAhead);
        if (token.value != 0) {
          let startIndex = actionIndex;
          if (token.extended > -1)
            actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
          actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
          if (!tokenizer.extend) {
            main = token;
            if (actionIndex > startIndex)
              break;
          }
        }
      }
      while (this.actions.length > actionIndex)
        this.actions.pop();
      if (lookAhead)
        stack.setLookAhead(lookAhead);
      if (!main && stack.pos == this.stream.end) {
        main = new CachedToken();
        main.value = stack.p.parser.eofTerm;
        main.start = main.end = stack.pos;
        actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
      }
      this.mainToken = main;
      return this.actions;
    }
    getMainToken(stack) {
      if (this.mainToken)
        return this.mainToken;
      let main = new CachedToken(), {pos, p} = stack;
      main.start = pos;
      main.end = Math.min(pos + 1, p.stream.end);
      main.value = pos == p.stream.end ? p.parser.eofTerm : 0;
      return main;
    }
    updateCachedToken(token, tokenizer, stack) {
      let start = this.stream.clipPos(stack.pos);
      tokenizer.token(this.stream.reset(start, token), stack);
      if (token.value > -1) {
        let {parser: parser7} = stack.p;
        for (let i = 0; i < parser7.specialized.length; i++)
          if (parser7.specialized[i] == token.value) {
            let result = parser7.specializers[i](this.stream.read(token.start, token.end), stack);
            if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
              if ((result & 1) == 0)
                token.value = result >> 1;
              else
                token.extended = result >> 1;
              break;
            }
          }
      } else {
        token.value = 0;
        token.end = this.stream.clipPos(start + 1);
      }
    }
    putAction(action, token, end, index) {
      for (let i = 0; i < index; i += 3)
        if (this.actions[i] == action)
          return index;
      this.actions[index++] = action;
      this.actions[index++] = token;
      this.actions[index++] = end;
      return index;
    }
    addActions(stack, token, end, index) {
      let {state} = stack, {parser: parser7} = stack.p, {data: data2} = parser7;
      for (let set = 0; set < 2; set++) {
        for (let i = parser7.stateSlot(state, set ? 2 : 1); ; i += 3) {
          if (data2[i] == 65535) {
            if (data2[i + 1] == 1) {
              i = pair(data2, i + 2);
            } else {
              if (index == 0 && data2[i + 1] == 2)
                index = this.putAction(pair(data2, i + 2), token, end, index);
              break;
            }
          }
          if (data2[i] == token)
            index = this.putAction(pair(data2, i + 1), token, end, index);
        }
      }
      return index;
    }
  };
  var Rec;
  (function(Rec2) {
    Rec2[Rec2["Distance"] = 5] = "Distance";
    Rec2[Rec2["MaxRemainingPerStep"] = 3] = "MaxRemainingPerStep";
    Rec2[Rec2["MinBufferLengthPrune"] = 500] = "MinBufferLengthPrune";
    Rec2[Rec2["ForceReduceLimit"] = 10] = "ForceReduceLimit";
    Rec2[Rec2["CutDepth"] = 15e3] = "CutDepth";
    Rec2[Rec2["CutTo"] = 9e3] = "CutTo";
  })(Rec || (Rec = {}));
  var Parse = class {
    constructor(parser7, input, fragments, ranges) {
      this.parser = parser7;
      this.input = input;
      this.ranges = ranges;
      this.recovering = 0;
      this.nextStackID = 9812;
      this.minStackPos = 0;
      this.reused = [];
      this.stoppedAt = null;
      this.stream = new InputStream(input, ranges);
      this.tokens = new TokenCache(parser7, this.stream);
      this.topTerm = parser7.top[1];
      let {from} = ranges[0];
      this.stacks = [Stack.start(this, parser7.top[0], from)];
      this.fragments = fragments.length && this.stream.end - from > parser7.bufferLength * 4 ? new FragmentCursor2(fragments, parser7.nodeSet) : null;
    }
    get parsedPos() {
      return this.minStackPos;
    }
    advance() {
      let stacks = this.stacks, pos = this.minStackPos;
      let newStacks = this.stacks = [];
      let stopped, stoppedTokens;
      for (let i = 0; i < stacks.length; i++) {
        let stack = stacks[i];
        for (; ; ) {
          this.tokens.mainToken = null;
          if (stack.pos > pos) {
            newStacks.push(stack);
          } else if (this.advanceStack(stack, newStacks, stacks)) {
            continue;
          } else {
            if (!stopped) {
              stopped = [];
              stoppedTokens = [];
            }
            stopped.push(stack);
            let tok = this.tokens.getMainToken(stack);
            stoppedTokens.push(tok.value, tok.end);
          }
          break;
        }
      }
      if (!newStacks.length) {
        let finished = stopped && findFinished(stopped);
        if (finished)
          return this.stackToTree(finished);
        if (this.parser.strict) {
          if (verbose && stopped)
            console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
          throw new SyntaxError("No parse at " + pos);
        }
        if (!this.recovering)
          this.recovering = 5;
      }
      if (this.recovering && stopped) {
        let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0] : this.runRecovery(stopped, stoppedTokens, newStacks);
        if (finished)
          return this.stackToTree(finished.forceAll());
      }
      if (this.recovering) {
        let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3;
        if (newStacks.length > maxRemaining) {
          newStacks.sort((a, b) => b.score - a.score);
          while (newStacks.length > maxRemaining)
            newStacks.pop();
        }
        if (newStacks.some((s) => s.reducePos > pos))
          this.recovering--;
      } else if (newStacks.length > 1) {
        outer:
          for (let i = 0; i < newStacks.length - 1; i++) {
            let stack = newStacks[i];
            for (let j = i + 1; j < newStacks.length; j++) {
              let other = newStacks[j];
              if (stack.sameState(other) || stack.buffer.length > 500 && other.buffer.length > 500) {
                if ((stack.score - other.score || stack.buffer.length - other.buffer.length) > 0) {
                  newStacks.splice(j--, 1);
                } else {
                  newStacks.splice(i--, 1);
                  continue outer;
                }
              }
            }
          }
      }
      this.minStackPos = newStacks[0].pos;
      for (let i = 1; i < newStacks.length; i++)
        if (newStacks[i].pos < this.minStackPos)
          this.minStackPos = newStacks[i].pos;
      return null;
    }
    stopAt(pos) {
      if (this.stoppedAt != null && this.stoppedAt < pos)
        throw new RangeError("Can't move stoppedAt forward");
      this.stoppedAt = pos;
    }
    advanceStack(stack, stacks, split) {
      let start = stack.pos, {parser: parser7} = this;
      let base2 = verbose ? this.stackID(stack) + " -> " : "";
      if (this.stoppedAt != null && start > this.stoppedAt)
        return stack.forceReduce() ? stack : null;
      if (this.fragments) {
        let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
        for (let cached = this.fragments.nodeAt(start); cached; ) {
          let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser7.getGoto(stack.state, cached.type.id) : -1;
          if (match > -1 && cached.length && (!strictCx || (cached.prop(NodeProp.contextHash) || 0) == cxHash)) {
            stack.useNode(cached, match);
            if (verbose)
              console.log(base2 + this.stackID(stack) + ` (via reuse of ${parser7.getName(cached.type.id)})`);
            return true;
          }
          if (!(cached instanceof Tree) || cached.children.length == 0 || cached.positions[0] > 0)
            break;
          let inner = cached.children[0];
          if (inner instanceof Tree && cached.positions[0] == 0)
            cached = inner;
          else
            break;
        }
      }
      let defaultReduce = parser7.stateSlot(stack.state, 4);
      if (defaultReduce > 0) {
        stack.reduce(defaultReduce);
        if (verbose)
          console.log(base2 + this.stackID(stack) + ` (via always-reduce ${parser7.getName(defaultReduce & 65535)})`);
        return true;
      }
      if (stack.stack.length >= 15e3) {
        while (stack.stack.length > 9e3 && stack.forceReduce()) {
        }
      }
      let actions = this.tokens.getActions(stack);
      for (let i = 0; i < actions.length; ) {
        let action = actions[i++], term = actions[i++], end = actions[i++];
        let last = i == actions.length || !split;
        let localStack = last ? stack : stack.split();
        localStack.apply(action, term, end);
        if (verbose)
          console.log(base2 + this.stackID(localStack) + ` (via ${(action & 65536) == 0 ? "shift" : `reduce of ${parser7.getName(action & 65535)}`} for ${parser7.getName(term)} @ ${start}${localStack == stack ? "" : ", split"})`);
        if (last)
          return true;
        else if (localStack.pos > start)
          stacks.push(localStack);
        else
          split.push(localStack);
      }
      return false;
    }
    advanceFully(stack, newStacks) {
      let pos = stack.pos;
      for (; ; ) {
        if (!this.advanceStack(stack, null, null))
          return false;
        if (stack.pos > pos) {
          pushStackDedup(stack, newStacks);
          return true;
        }
      }
    }
    runRecovery(stacks, tokens, newStacks) {
      let finished = null, restarted = false;
      for (let i = 0; i < stacks.length; i++) {
        let stack = stacks[i], token = tokens[i << 1], tokenEnd = tokens[(i << 1) + 1];
        let base2 = verbose ? this.stackID(stack) + " -> " : "";
        if (stack.deadEnd) {
          if (restarted)
            continue;
          restarted = true;
          stack.restart();
          if (verbose)
            console.log(base2 + this.stackID(stack) + " (restarted)");
          let done = this.advanceFully(stack, newStacks);
          if (done)
            continue;
        }
        let force = stack.split(), forceBase = base2;
        for (let j = 0; force.forceReduce() && j < 10; j++) {
          if (verbose)
            console.log(forceBase + this.stackID(force) + " (via force-reduce)");
          let done = this.advanceFully(force, newStacks);
          if (done)
            break;
          if (verbose)
            forceBase = this.stackID(force) + " -> ";
        }
        for (let insert2 of stack.recoverByInsert(token)) {
          if (verbose)
            console.log(base2 + this.stackID(insert2) + " (via recover-insert)");
          this.advanceFully(insert2, newStacks);
        }
        if (this.stream.end > stack.pos) {
          if (tokenEnd == stack.pos) {
            tokenEnd++;
            token = 0;
          }
          stack.recoverByDelete(token, tokenEnd);
          if (verbose)
            console.log(base2 + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
          pushStackDedup(stack, newStacks);
        } else if (!finished || finished.score < stack.score) {
          finished = stack;
        }
      }
      return finished;
    }
    stackToTree(stack) {
      stack.close();
      return Tree.build({
        buffer: StackBufferCursor.create(stack),
        nodeSet: this.parser.nodeSet,
        topID: this.topTerm,
        maxBufferLength: this.parser.bufferLength,
        reused: this.reused,
        start: this.ranges[0].from,
        length: stack.pos - this.ranges[0].from,
        minRepeatType: this.parser.minRepeatTerm
      });
    }
    stackID(stack) {
      let id2 = (stackIDs || (stackIDs = new WeakMap())).get(stack);
      if (!id2)
        stackIDs.set(stack, id2 = String.fromCodePoint(this.nextStackID++));
      return id2 + stack;
    }
  };
  function pushStackDedup(stack, newStacks) {
    for (let i = 0; i < newStacks.length; i++) {
      let other = newStacks[i];
      if (other.pos == stack.pos && other.sameState(stack)) {
        if (newStacks[i].score < stack.score)
          newStacks[i] = stack;
        return;
      }
    }
    newStacks.push(stack);
  }
  var Dialect = class {
    constructor(source, flags, disabled) {
      this.source = source;
      this.flags = flags;
      this.disabled = disabled;
    }
    allows(term) {
      return !this.disabled || this.disabled[term] == 0;
    }
  };
  var id = (x) => x;
  var ContextTracker = class {
    constructor(spec) {
      this.start = spec.start;
      this.shift = spec.shift || id;
      this.reduce = spec.reduce || id;
      this.reuse = spec.reuse || id;
      this.hash = spec.hash || (() => 0);
      this.strict = spec.strict !== false;
    }
  };
  var LRParser = class extends Parser {
    constructor(spec) {
      super();
      this.wrappers = [];
      if (spec.version != 14)
        throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14})`);
      let nodeNames = spec.nodeNames.split(" ");
      this.minRepeatTerm = nodeNames.length;
      for (let i = 0; i < spec.repeatNodeCount; i++)
        nodeNames.push("");
      let topTerms = Object.keys(spec.topRules).map((r) => spec.topRules[r][1]);
      let nodeProps = [];
      for (let i = 0; i < nodeNames.length; i++)
        nodeProps.push([]);
      function setProp(nodeID, prop, value) {
        nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
      }
      if (spec.nodeProps)
        for (let propSpec of spec.nodeProps) {
          let prop = propSpec[0];
          if (typeof prop == "string")
            prop = NodeProp[prop];
          for (let i = 1; i < propSpec.length; ) {
            let next = propSpec[i++];
            if (next >= 0) {
              setProp(next, prop, propSpec[i++]);
            } else {
              let value = propSpec[i + -next];
              for (let j = -next; j > 0; j--)
                setProp(propSpec[i++], prop, value);
              i++;
            }
          }
        }
      this.nodeSet = new NodeSet(nodeNames.map((name2, i) => NodeType.define({
        name: i >= this.minRepeatTerm ? void 0 : name2,
        id: i,
        props: nodeProps[i],
        top: topTerms.indexOf(i) > -1,
        error: i == 0,
        skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i) > -1
      })));
      if (spec.propSources)
        this.nodeSet = this.nodeSet.extend(...spec.propSources);
      this.strict = false;
      this.bufferLength = DefaultBufferLength;
      let tokenArray = decodeArray(spec.tokenData);
      this.context = spec.context;
      this.specializerSpecs = spec.specialized || [];
      this.specialized = new Uint16Array(this.specializerSpecs.length);
      for (let i = 0; i < this.specializerSpecs.length; i++)
        this.specialized[i] = this.specializerSpecs[i].term;
      this.specializers = this.specializerSpecs.map(getSpecializer);
      this.states = decodeArray(spec.states, Uint32Array);
      this.data = decodeArray(spec.stateData);
      this.goto = decodeArray(spec.goto);
      this.maxTerm = spec.maxTerm;
      this.tokenizers = spec.tokenizers.map((value) => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
      this.topRules = spec.topRules;
      this.dialects = spec.dialects || {};
      this.dynamicPrecedences = spec.dynamicPrecedences || null;
      this.tokenPrecTable = spec.tokenPrec;
      this.termNames = spec.termNames || null;
      this.maxNode = this.nodeSet.types.length - 1;
      this.dialect = this.parseDialect();
      this.top = this.topRules[Object.keys(this.topRules)[0]];
    }
    createParse(input, fragments, ranges) {
      let parse = new Parse(this, input, fragments, ranges);
      for (let w of this.wrappers)
        parse = w(parse, input, fragments, ranges);
      return parse;
    }
    getGoto(state, term, loose = false) {
      let table = this.goto;
      if (term >= table[0])
        return -1;
      for (let pos = table[term + 1]; ; ) {
        let groupTag = table[pos++], last = groupTag & 1;
        let target = table[pos++];
        if (last && loose)
          return target;
        for (let end = pos + (groupTag >> 1); pos < end; pos++)
          if (table[pos] == state)
            return target;
        if (last)
          return -1;
      }
    }
    hasAction(state, terminal) {
      let data2 = this.data;
      for (let set = 0; set < 2; set++) {
        for (let i = this.stateSlot(state, set ? 2 : 1), next; ; i += 3) {
          if ((next = data2[i]) == 65535) {
            if (data2[i + 1] == 1)
              next = data2[i = pair(data2, i + 2)];
            else if (data2[i + 1] == 2)
              return pair(data2, i + 2);
            else
              break;
          }
          if (next == terminal || next == 0)
            return pair(data2, i + 1);
        }
      }
      return 0;
    }
    stateSlot(state, slot) {
      return this.states[state * 6 + slot];
    }
    stateFlag(state, flag) {
      return (this.stateSlot(state, 0) & flag) > 0;
    }
    validAction(state, action) {
      if (action == this.stateSlot(state, 4))
        return true;
      for (let i = this.stateSlot(state, 1); ; i += 3) {
        if (this.data[i] == 65535) {
          if (this.data[i + 1] == 1)
            i = pair(this.data, i + 2);
          else
            return false;
        }
        if (action == pair(this.data, i + 1))
          return true;
      }
    }
    nextStates(state) {
      let result = [];
      for (let i = this.stateSlot(state, 1); ; i += 3) {
        if (this.data[i] == 65535) {
          if (this.data[i + 1] == 1)
            i = pair(this.data, i + 2);
          else
            break;
        }
        if ((this.data[i + 2] & 65536 >> 16) == 0) {
          let value = this.data[i + 1];
          if (!result.some((v, i2) => i2 & 1 && v == value))
            result.push(this.data[i], value);
        }
      }
      return result;
    }
    overrides(token, prev) {
      let iPrev = findOffset(this.data, this.tokenPrecTable, prev);
      return iPrev < 0 || findOffset(this.data, this.tokenPrecTable, token) < iPrev;
    }
    configure(config) {
      let copy = Object.assign(Object.create(LRParser.prototype), this);
      if (config.props)
        copy.nodeSet = this.nodeSet.extend(...config.props);
      if (config.top) {
        let info = this.topRules[config.top];
        if (!info)
          throw new RangeError(`Invalid top rule name ${config.top}`);
        copy.top = info;
      }
      if (config.tokenizers)
        copy.tokenizers = this.tokenizers.map((t2) => {
          let found = config.tokenizers.find((r) => r.from == t2);
          return found ? found.to : t2;
        });
      if (config.specializers) {
        copy.specializers = this.specializers.slice();
        copy.specializerSpecs = this.specializerSpecs.map((s, i) => {
          let found = config.specializers.find((r) => r.from == s.external);
          if (!found)
            return s;
          let spec = Object.assign(Object.assign({}, s), {external: found.to});
          copy.specializers[i] = getSpecializer(spec);
          return spec;
        });
      }
      if (config.contextTracker)
        copy.context = config.contextTracker;
      if (config.dialect)
        copy.dialect = this.parseDialect(config.dialect);
      if (config.strict != null)
        copy.strict = config.strict;
      if (config.wrap)
        copy.wrappers = copy.wrappers.concat(config.wrap);
      if (config.bufferLength != null)
        copy.bufferLength = config.bufferLength;
      return copy;
    }
    hasWrappers() {
      return this.wrappers.length > 0;
    }
    getName(term) {
      return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
    }
    get eofTerm() {
      return this.maxNode + 1;
    }
    get topNode() {
      return this.nodeSet.types[this.top[1]];
    }
    dynamicPrecedence(term) {
      let prec2 = this.dynamicPrecedences;
      return prec2 == null ? 0 : prec2[term] || 0;
    }
    parseDialect(dialect) {
      let values2 = Object.keys(this.dialects), flags = values2.map(() => false);
      if (dialect)
        for (let part of dialect.split(" ")) {
          let id2 = values2.indexOf(part);
          if (id2 >= 0)
            flags[id2] = true;
        }
      let disabled = null;
      for (let i = 0; i < values2.length; i++)
        if (!flags[i]) {
          for (let j = this.dialects[values2[i]], id2; (id2 = this.data[j++]) != 65535; )
            (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id2] = 1;
        }
      return new Dialect(dialect, flags, disabled);
    }
    static deserialize(spec) {
      return new LRParser(spec);
    }
  };
  function pair(data2, off) {
    return data2[off] | data2[off + 1] << 16;
  }
  function findOffset(data2, start, term) {
    for (let i = start, next; (next = data2[i]) != 65535; i++)
      if (next == term)
        return i - start;
    return -1;
  }
  function findFinished(stacks) {
    let best = null;
    for (let stack of stacks) {
      let stopped = stack.p.stoppedAt;
      if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) && stack.p.parser.stateFlag(stack.state, 2) && (!best || best.score < stack.score))
        best = stack;
    }
    return best;
  }
  function getSpecializer(spec) {
    if (spec.external) {
      let mask = spec.extend ? 1 : 0;
      return (value, stack) => spec.external(value, stack) << 1 | mask;
    }
    return spec.get;
  }

  // node_modules/@lezer/json/dist/index.es.js
  var jsonHighlighting = styleTags({
    String: tags.string,
    Number: tags.number,
    "True False": tags.bool,
    PropertyName: tags.propertyName,
    Null: tags.null,
    ",": tags.separator,
    "[ ]": tags.squareBracket,
    "{ }": tags.brace
  });
  var parser = LRParser.deserialize({
    version: 14,
    states: "$bOVQPOOOOQO'#Cb'#CbOnQPO'#CeOvQPO'#CjOOQO'#Cp'#CpQOQPOOOOQO'#Cg'#CgO}QPO'#CfO!SQPO'#CrOOQO,59P,59PO![QPO,59PO!aQPO'#CuOOQO,59U,59UO!iQPO,59UOVQPO,59QOqQPO'#CkO!nQPO,59^OOQO1G.k1G.kOVQPO'#ClO!vQPO,59aOOQO1G.p1G.pOOQO1G.l1G.lOOQO,59V,59VOOQO-E6i-E6iOOQO,59W,59WOOQO-E6j-E6j",
    stateData: "#O~OcOS~OQSORSOSSOTSOWQO]ROePO~OVXOeUO~O[[O~PVOg^O~Oh_OVfX~OVaO~OhbO[iX~O[dO~Oh_OVfa~OhbO[ia~O",
    goto: "!kjPPPPPPkPPkqwPPk{!RPPP!XP!ePP!hXSOR^bQWQRf_TVQ_Q`WRg`QcZRicQTOQZRQe^RhbRYQR]R",
    nodeNames: "\u26A0 JsonText True False Null Number String } { Object Property PropertyName ] [ Array",
    maxTerm: 25,
    nodeProps: [
      ["openedBy", 7, "{", 12, "["],
      ["closedBy", 8, "}", 13, "]"]
    ],
    propSources: [jsonHighlighting],
    skippedNodes: [0],
    repeatNodeCount: 2,
    tokenData: "(p~RaXY!WYZ!W]^!Wpq!Wrs!]|}$i}!O$n!Q!R$w!R![&V![!]&h!}#O&m#P#Q&r#Y#Z&w#b#c'f#h#i'}#o#p(f#q#r(k~!]Oc~~!`Upq!]qr!]rs!rs#O!]#O#P!w#P~!]~!wOe~~!zXrs!]!P!Q!]#O#P!]#U#V!]#Y#Z!]#b#c!]#f#g!]#h#i!]#i#j#g~#jR!Q![#s!c!i#s#T#Z#s~#vR!Q![$P!c!i$P#T#Z$P~$SR!Q![$]!c!i$]#T#Z$]~$`R!Q![!]!c!i!]#T#Z!]~$nOh~~$qQ!Q!R$w!R![&V~$|RT~!O!P%V!g!h%k#X#Y%k~%YP!Q![%]~%bRT~!Q![%]!g!h%k#X#Y%k~%nR{|%w}!O%w!Q![%}~%zP!Q![%}~&SPT~!Q![%}~&[ST~!O!P%V!Q![&V!g!h%k#X#Y%k~&mOg~~&rO]~~&wO[~~&zP#T#U&}~'QP#`#a'T~'WP#g#h'Z~'^P#X#Y'a~'fOR~~'iP#i#j'l~'oP#`#a'r~'uP#`#a'x~'}OS~~(QP#f#g(T~(WP#i#j(Z~(^P#X#Y(a~(fOQ~~(kOW~~(pOV~",
    tokenizers: [0],
    topRules: {JsonText: [0, 1]},
    tokenPrec: 0
  });

  // node_modules/@codemirror/lang-json/dist/index.js
  var jsonLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "json",
    parser: /* @__PURE__ */ parser.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          Object: /* @__PURE__ */ continuedIndent({except: /^\s*\}/}),
          Array: /* @__PURE__ */ continuedIndent({except: /^\s*\]/})
        }),
        /* @__PURE__ */ foldNodeProp.add({
          "Object Array": foldInside
        })
      ]
    }),
    languageData: {
      closeBrackets: {brackets: ["[", "{", '"']},
      indentOnInput: /^\s*[\}\]]$/
    }
  });
  function json() {
    return new LanguageSupport(jsonLanguage);
  }

  // node_modules/@lezer/css/dist/index.es.js
  var descendantOp = 93;
  var Unit = 1;
  var callee = 94;
  var identifier = 95;
  var VariableName = 2;
  var space = [
    9,
    10,
    11,
    12,
    13,
    32,
    133,
    160,
    5760,
    8192,
    8193,
    8194,
    8195,
    8196,
    8197,
    8198,
    8199,
    8200,
    8201,
    8202,
    8232,
    8233,
    8239,
    8287,
    12288
  ];
  var colon = 58;
  var parenL = 40;
  var underscore = 95;
  var bracketL = 91;
  var dash = 45;
  var period = 46;
  var hash = 35;
  var percent = 37;
  function isAlpha(ch) {
    return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 || ch >= 161;
  }
  function isDigit(ch) {
    return ch >= 48 && ch <= 57;
  }
  var identifiers = new ExternalTokenizer((input, stack) => {
    for (let inside2 = false, dashes = 0, i = 0; ; i++) {
      let {next} = input;
      if (isAlpha(next) || next == dash || next == underscore || inside2 && isDigit(next)) {
        if (!inside2 && (next != dash || i > 0))
          inside2 = true;
        if (dashes === i && next == dash)
          dashes++;
        input.advance();
      } else {
        if (inside2)
          input.acceptToken(next == parenL ? callee : dashes == 2 && stack.canShift(VariableName) ? VariableName : identifier);
        break;
      }
    }
  });
  var descendant = new ExternalTokenizer((input) => {
    if (space.includes(input.peek(-1))) {
      let {next} = input;
      if (isAlpha(next) || next == underscore || next == hash || next == period || next == bracketL || next == colon || next == dash)
        input.acceptToken(descendantOp);
    }
  });
  var unitToken = new ExternalTokenizer((input) => {
    if (!space.includes(input.peek(-1))) {
      let {next} = input;
      if (next == percent) {
        input.advance();
        input.acceptToken(Unit);
      }
      if (isAlpha(next)) {
        do {
          input.advance();
        } while (isAlpha(input.next));
        input.acceptToken(Unit);
      }
    }
  });
  var cssHighlighting = styleTags({
    "AtKeyword import charset namespace keyframes media supports": tags.definitionKeyword,
    "from to selector": tags.keyword,
    NamespaceName: tags.namespace,
    KeyframeName: tags.labelName,
    TagName: tags.tagName,
    ClassName: tags.className,
    PseudoClassName: tags.constant(tags.className),
    IdName: tags.labelName,
    "FeatureName PropertyName": tags.propertyName,
    AttributeName: tags.attributeName,
    NumberLiteral: tags.number,
    KeywordQuery: tags.keyword,
    UnaryQueryOp: tags.operatorKeyword,
    "CallTag ValueName": tags.atom,
    VariableName: tags.variableName,
    Callee: tags.operatorKeyword,
    Unit: tags.unit,
    "UniversalSelector NestingSelector": tags.definitionOperator,
    MatchOp: tags.compareOperator,
    "ChildOp SiblingOp, LogicOp": tags.logicOperator,
    BinOp: tags.arithmeticOperator,
    Important: tags.modifier,
    Comment: tags.blockComment,
    ParenthesizedContent: tags.special(tags.name),
    ColorLiteral: tags.color,
    StringLiteral: tags.string,
    ":": tags.punctuation,
    "PseudoOp #": tags.derefOperator,
    "; ,": tags.separator,
    "( )": tags.paren,
    "[ ]": tags.squareBracket,
    "{ }": tags.brace
  });
  var spec_callee = {__proto__: null, lang: 32, "nth-child": 32, "nth-last-child": 32, "nth-of-type": 32, "nth-last-of-type": 32, dir: 32, "host-context": 32, url: 60, "url-prefix": 60, domain: 60, regexp: 60, selector: 134};
  var spec_AtKeyword = {__proto__: null, "@import": 114, "@media": 138, "@charset": 142, "@namespace": 146, "@keyframes": 152, "@supports": 164};
  var spec_identifier = {__proto__: null, not: 128, only: 128, from: 158, to: 160};
  var parser2 = LRParser.deserialize({
    version: 14,
    states: "7WOYQ[OOOOQP'#Cd'#CdOOQP'#Cc'#CcO!ZQ[O'#CfO!}QXO'#CaO#UQ[O'#ChO#aQ[O'#DPO#fQ[O'#DTOOQP'#Ec'#EcO#kQdO'#DeO$VQ[O'#DrO#kQdO'#DtO$hQ[O'#DvO$sQ[O'#DyO$xQ[O'#EPO%WQ[O'#EROOQS'#Eb'#EbOOQS'#ES'#ESQYQ[OOOOQP'#Cg'#CgOOQP,59Q,59QO!ZQ[O,59QO%_Q[O'#EVO%yQWO,58{O&RQ[O,59SO#aQ[O,59kO#fQ[O,59oO%_Q[O,59sO%_Q[O,59uO%_Q[O,59vO'bQ[O'#D`OOQS,58{,58{OOQP'#Ck'#CkOOQO'#C}'#C}OOQP,59S,59SO'iQWO,59SO'nQWO,59SOOQP'#DR'#DROOQP,59k,59kOOQO'#DV'#DVO'sQ`O,59oOOQS'#Cp'#CpO#kQdO'#CqO'{QvO'#CsO)VQtO,5:POOQO'#Cx'#CxO'nQWO'#CwO)kQWO'#CyOOQS'#Ef'#EfOOQO'#Dh'#DhO)pQ[O'#DoO*OQWO'#EiO$xQ[O'#DmO*^QWO'#DpOOQO'#Ej'#EjO%|QWO,5:^O*cQpO,5:`OOQS'#Dx'#DxO*kQWO,5:bO*pQ[O,5:bOOQO'#D{'#D{O*xQWO,5:eO*}QWO,5:kO+VQWO,5:mOOQS-E8Q-E8QOOQP1G.l1G.lO+yQXO,5:qOOQO-E8T-E8TOOQS1G.g1G.gOOQP1G.n1G.nO'iQWO1G.nO'nQWO1G.nOOQP1G/V1G/VO,WQ`O1G/ZO,qQXO1G/_O-XQXO1G/aO-oQXO1G/bO.VQXO'#CdO.zQWO'#DaOOQS,59z,59zO/PQWO,59zO/XQ[O,59zO/`Q[O'#DOO/gQdO'#CoOOQP1G/Z1G/ZO#kQdO1G/ZO/nQpO,59]OOQS,59_,59_O#kQdO,59aO/vQWO1G/kOOQS,59c,59cO/{Q!bO,59eO0TQWO'#DhO0`QWO,5:TO0eQWO,5:ZO$xQ[O,5:VO$xQ[O'#EYO0mQWO,5;TO0xQWO,5:XO%_Q[O,5:[OOQS1G/x1G/xOOQS1G/z1G/zOOQS1G/|1G/|O1ZQWO1G/|O1`QdO'#D|OOQS1G0P1G0POOQS1G0V1G0VOOQS1G0X1G0XOOQP7+$Y7+$YOOQP7+$u7+$uO#kQdO7+$uO#kQdO,59{O1nQ[O'#EXO1xQWO1G/fOOQS1G/f1G/fO1xQWO1G/fO2QQXO'#EhO2XQWO,59jO2^QtO'#ETO3RQdO'#EeO3]QWO,59ZO3bQpO7+$uOOQS1G.w1G.wOOQS1G.{1G.{OOQS7+%V7+%VO3jQWO1G/PO#kQdO1G/oOOQO1G/u1G/uOOQO1G/q1G/qO3oQWO,5:tOOQO-E8W-E8WO3}QXO1G/vOOQS7+%h7+%hO4UQYO'#CsO%|QWO'#EZO4^QdO,5:hOOQS,5:h,5:hO4lQpO<<HaO4tQtO1G/gOOQO,5:s,5:sO5XQ[O,5:sOOQO-E8V-E8VOOQS7+%Q7+%QO5cQWO7+%QO5kQWO,5;SOOQP1G/U1G/UOOQS-E8R-E8RO#kQdO'#EUO5sQWO,5;POOQT1G.u1G.uOOQP<<Ha<<HaOOQS7+$k7+$kO5{QdO7+%ZOOQO7+%b7+%bOOQS,5:u,5:uOOQS-E8X-E8XOOQS1G0S1G0SOOQPAN={AN={O6SQtO'#EWO#kQdO'#EWO6}QdO7+%ROOQO7+%R7+%ROOQO1G0_1G0_OOQS<<Hl<<HlO7_QdO,5:pOOQO-E8S-E8SOOQO<<Hu<<HuO7iQtO,5:rOOQS-E8U-E8UOOQO<<Hm<<Hm",
    stateData: "8j~O#TOSROS~OUWOXWO]TO^TOtUOxVO!Y_O!ZXO!gYO!iZO!k[O!n]O!t^O#RPO#WRO~O#RcO~O]hO^hOpfOtiOxjO|kO!PmO#PlO#WeO~O!RnO~P!`O`tO#QqO#RpO~O#RuO~O#RwO~OQ!QObzOf!QOh!QOn!PO#Q}O#RyO#Z{O~Ob!SO!b!UO!e!VO#R!RO!R#]P~Oh![On!PO#R!ZO~O#R!^O~Ob!SO!b!UO!e!VO#R!RO~O!W#]P~P$VOUWOXWO]TO^TOtUOxVO#RPO#WRO~OpfO!RnO~O`!iO#QqO#RpO~OQ!pOUWOXWO]TO^TOtUOxVO!Y_O!ZXO!gYO!iZO!k[O!n]O!t^O#R!oO#WRO~O!Q!qO~P&^Ob!tO~Ob!uO~Ov!vOz!wO~OP!yObgXjgX!WgX!bgX!egX#RgXagXQgXfgXhgXngXpgX#QgX#ZgXvgX!QgX!VgX~Ob!SOj!zO!b!UO!e!VO#R!RO!W#]P~Ob!}O~Ob!SO!b!UO!e!VO#R#OO~Op#SO!`#RO!R#]X!W#]X~Ob#VO~Oj!zO!W#XO~O!W#YO~Oh#ZOn!PO~O!R#[O~O!RnO!`#RO~O!RnO!W#_O~O]hO^hOtiOxjO|kO!PmO#PlO#WeO~Op!ya!R!yaa!ya~P+_Ov#aOz#bO~O]hO^hOtiOxjO#WeO~Op{i|{i!P{i!R{i#P{ia{i~P,`Op}i|}i!P}i!R}i#P}ia}i~P,`Op!Oi|!Oi!P!Oi!R!Oi#P!Oia!Oi~P,`O]WX]!UX^WXpWXtWXxWX|WX!PWX!RWX#PWX#WWX~O]#cO~O!Q#fO!W#dO~O!Q#fO~P&^Oa#[P~P%_Oa#XP~P#kOa#nOj!zO~O!W#pO~Oh#qOo#qO~O]!^Xa![X!`![X~O]#rO~Oa#sO!`#RO~Op#SO!R#]a!W#]a~O!`#ROp!aa!R!aa!W!aaa!aa~O!W#xO~O!Q#|O!q#zO!r#zO#Z#yO~O!Q!{X!W!{X~P&^O!Q$SO!W#dO~Oa#[X~P!`Oa$VO~Oj!zOQ!wXa!wXb!wXf!wXh!wXn!wXp!wX#Q!wX#R!wX#Z!wX~Op$XOa#XX~P#kOa$ZO~Oj!zOv$[O~Oa$]O~O!`#ROp!|a!R!|a!W!|a~Oa$_O~P+_OP!yO!RgX~O!Q$bO!q#zO!r#zO#Z#yO~Oj!zOv$cO~Oj!zOp$eO!V$gO!Q!Ti!W!Ti~P#kO!Q!{a!W!{a~P&^O!Q$iO!W#dO~OpfOa#[a~Op$XOa#Xa~Oa$lO~P#kOj!zOQ!zXb!zXf!zXh!zXn!zXp!zX!Q!zX!V!zX!W!zX#Q!zX#R!zX#Z!zX~Op$eO!V$oO!Q!Tq!W!Tq~P#kOa!xap!xa~P#kOj!zOQ!zab!zaf!zah!zan!zap!za!Q!za!V!za!W!za#Q!za#R!za#Z!za~Oo#Zj!Pj~",
    goto: ",O#_PPPPP#`P#h#vP#h$U#hPP$[PPP$b$k$kP$}P$kP$k%e%wPPP&a&g#hP&mP#hP&sP#hP#h#hPPP&y']'iPP#`PP'o'o'y'oP'oP'o'oP#`P#`P#`P'|#`P(P(SPP#`P#`(V(e(s(y)T)Z)e)kPPPPPP)q)yP*e*hP+^+a+j]`Obn!s#d$QiWObfklmn!s!t#V#d$QiQObfklmn!s!t#V#d$QQdRR!ceQrTR!ghQ!gtQ!|!OR#`!iq!QXZz!u!w!z#b#c#k#r$O$X$^$e$f$jp!QXZz!u!w!z#b#c#k#r$O$X$^$e$f$jT#z#[#{q!OXZz!u!w!z#b#c#k#r$O$X$^$e$f$jp!QXZz!u!w!z#b#c#k#r$O$X$^$e$f$jQ![[R#Z!]QsTR!hhQ!gsR#`!hQvUR!jiQxVR!kjQoSQ!fgQ#W!XQ#^!`Q#_!aR$`#zQ!rnQ#g!sQ$P#dR$h$QX!pn!s#d$Qa!WY^_|!S!U#R#SR#P!SR!][R!_]R#]!_QbOU!bb!s$QQ!snR$Q#dQ#k!uU$W#k$^$jQ$^#rR$j$XQ$Y#kR$k$YQgSS!eg$UR$U#hQ$f$OR$n$fQ#e!rS$R#e$TR$T#gQ#T!TR#v#TQ#{#[R$a#{]aObn!s#d$Q[SObn!s#d$QQ!dfQ!lkQ!mlQ!nmQ#h!tR#w#VR#l!uQ|XQ!YZQ!xz[#j!u#k#r$X$^$jQ#m!wQ#o!zQ#}#bQ$O#cS$d$O$fR$m$eR#i!tQ!XYQ!a_R!{|U!TY_|Q!`^Q#Q!SQ#U!UQ#t#RR#u#S",
    nodeNames: "\u26A0 Unit VariableName Comment StyleSheet RuleSet UniversalSelector TagSelector TagName NestingSelector ClassSelector ClassName PseudoClassSelector : :: PseudoClassName PseudoClassName ) ( ArgList ValueName ParenthesizedValue ColorLiteral NumberLiteral StringLiteral BinaryExpression BinOp CallExpression Callee CallLiteral CallTag ParenthesizedContent , PseudoClassName ArgList IdSelector # IdName ] AttributeSelector [ AttributeName MatchOp ChildSelector ChildOp DescendantSelector SiblingSelector SiblingOp } { Block Declaration PropertyName Important ; ImportStatement AtKeyword import KeywordQuery FeatureQuery FeatureName BinaryQuery LogicOp UnaryQuery UnaryQueryOp ParenthesizedQuery SelectorQuery selector MediaStatement media CharsetStatement charset NamespaceStatement namespace NamespaceName KeyframesStatement keyframes KeyframeName KeyframeList from to SupportsStatement supports AtRule",
    maxTerm: 106,
    nodeProps: [
      ["openedBy", 17, "(", 48, "{"],
      ["closedBy", 18, ")", 49, "}"]
    ],
    propSources: [cssHighlighting],
    skippedNodes: [0, 3],
    repeatNodeCount: 8,
    tokenData: "Ay~R![OX$wX^%]^p$wpq%]qr(crs+}st,otu2Uuv$wvw2rwx2}xy3jyz3uz{3z{|4_|}8U}!O8a!O!P8x!P!Q9Z!Q![;e![!]<Y!]!^<x!^!_$w!_!`=T!`!a=`!a!b$w!b!c>O!c!}$w!}#O?[#O#P$w#P#Q?g#Q#R2U#R#T$w#T#U?r#U#c$w#c#d@q#d#o$w#o#pAQ#p#q2U#q#rA]#r#sAh#s#y$w#y#z%]#z$f$w$f$g%]$g#BY$w#BY#BZ%]#BZ$IS$w$IS$I_%]$I_$I|$w$I|$JO%]$JO$JT$w$JT$JU%]$JU$KV$w$KV$KW%]$KW&FU$w&FU&FV%]&FV~$wW$zQOy%Qz~%QW%VQoWOy%Qz~%Q~%bf#T~OX%QX^&v^p%Qpq&vqy%Qz#y%Q#y#z&v#z$f%Q$f$g&v$g#BY%Q#BY#BZ&v#BZ$IS%Q$IS$I_&v$I_$I|%Q$I|$JO&v$JO$JT%Q$JT$JU&v$JU$KV%Q$KV$KW&v$KW&FU%Q&FU&FV&v&FV~%Q~&}f#T~oWOX%QX^&v^p%Qpq&vqy%Qz#y%Q#y#z&v#z$f%Q$f$g&v$g#BY%Q#BY#BZ&v#BZ$IS%Q$IS$I_&v$I_$I|%Q$I|$JO&v$JO$JT%Q$JT$JU&v$JU$KV%Q$KV$KW&v$KW&FU%Q&FU&FV&v&FV~%Q^(fSOy%Qz#]%Q#]#^(r#^~%Q^(wSoWOy%Qz#a%Q#a#b)T#b~%Q^)YSoWOy%Qz#d%Q#d#e)f#e~%Q^)kSoWOy%Qz#c%Q#c#d)w#d~%Q^)|SoWOy%Qz#f%Q#f#g*Y#g~%Q^*_SoWOy%Qz#h%Q#h#i*k#i~%Q^*pSoWOy%Qz#T%Q#T#U*|#U~%Q^+RSoWOy%Qz#b%Q#b#c+_#c~%Q^+dSoWOy%Qz#h%Q#h#i+p#i~%Q^+wQ!VUoWOy%Qz~%Q~,QUOY+}Zr+}rs,ds#O+}#O#P,i#P~+}~,iOh~~,lPO~+}_,tWtPOy%Qz!Q%Q!Q![-^![!c%Q!c!i-^!i#T%Q#T#Z-^#Z~%Q^-cWoWOy%Qz!Q%Q!Q![-{![!c%Q!c!i-{!i#T%Q#T#Z-{#Z~%Q^.QWoWOy%Qz!Q%Q!Q![.j![!c%Q!c!i.j!i#T%Q#T#Z.j#Z~%Q^.qWfUoWOy%Qz!Q%Q!Q![/Z![!c%Q!c!i/Z!i#T%Q#T#Z/Z#Z~%Q^/bWfUoWOy%Qz!Q%Q!Q![/z![!c%Q!c!i/z!i#T%Q#T#Z/z#Z~%Q^0PWoWOy%Qz!Q%Q!Q![0i![!c%Q!c!i0i!i#T%Q#T#Z0i#Z~%Q^0pWfUoWOy%Qz!Q%Q!Q![1Y![!c%Q!c!i1Y!i#T%Q#T#Z1Y#Z~%Q^1_WoWOy%Qz!Q%Q!Q![1w![!c%Q!c!i1w!i#T%Q#T#Z1w#Z~%Q^2OQfUoWOy%Qz~%QY2XSOy%Qz!_%Q!_!`2e!`~%QY2lQzQoWOy%Qz~%QX2wQXPOy%Qz~%Q~3QUOY2}Zw2}wx,dx#O2}#O#P3d#P~2}~3gPO~2}_3oQbVOy%Qz~%Q~3zOa~_4RSUPjSOy%Qz!_%Q!_!`2e!`~%Q_4fUjS!PPOy%Qz!O%Q!O!P4x!P!Q%Q!Q![7_![~%Q^4}SoWOy%Qz!Q%Q!Q![5Z![~%Q^5bWoW#ZUOy%Qz!Q%Q!Q![5Z![!g%Q!g!h5z!h#X%Q#X#Y5z#Y~%Q^6PWoWOy%Qz{%Q{|6i|}%Q}!O6i!O!Q%Q!Q![6z![~%Q^6nSoWOy%Qz!Q%Q!Q![6z![~%Q^7RSoW#ZUOy%Qz!Q%Q!Q![6z![~%Q^7fYoW#ZUOy%Qz!O%Q!O!P5Z!P!Q%Q!Q![7_![!g%Q!g!h5z!h#X%Q#X#Y5z#Y~%Q_8ZQpVOy%Qz~%Q^8fUjSOy%Qz!O%Q!O!P4x!P!Q%Q!Q![7_![~%Q_8}S#WPOy%Qz!Q%Q!Q![5Z![~%Q~9`RjSOy%Qz{9i{~%Q~9nSoWOy9iyz9zz{:o{~9i~9}ROz9zz{:W{~9z~:ZTOz9zz{:W{!P9z!P!Q:j!Q~9z~:oOR~~:tUoWOy9iyz9zz{:o{!P9i!P!Q;W!Q~9i~;_QoWR~Oy%Qz~%Q^;jY#ZUOy%Qz!O%Q!O!P5Z!P!Q%Q!Q![7_![!g%Q!g!h5z!h#X%Q#X#Y5z#Y~%QX<_S]POy%Qz![%Q![!]<k!]~%QX<rQ^PoWOy%Qz~%Q_<}Q!WVOy%Qz~%QY=YQzQOy%Qz~%QX=eS|POy%Qz!`%Q!`!a=q!a~%QX=xQ|PoWOy%Qz~%QX>RUOy%Qz!c%Q!c!}>e!}#T%Q#T#o>e#o~%QX>lY!YPoWOy%Qz}%Q}!O>e!O!Q%Q!Q![>e![!c%Q!c!}>e!}#T%Q#T#o>e#o~%QX?aQxPOy%Qz~%Q^?lQvUOy%Qz~%QX?uSOy%Qz#b%Q#b#c@R#c~%QX@WSoWOy%Qz#W%Q#W#X@d#X~%QX@kQ!`PoWOy%Qz~%QX@tSOy%Qz#f%Q#f#g@d#g~%QXAVQ!RPOy%Qz~%Q_AbQ!QVOy%Qz~%QZAmS!PPOy%Qz!_%Q!_!`2e!`~%Q",
    tokenizers: [descendant, unitToken, identifiers, 0, 1, 2, 3],
    topRules: {StyleSheet: [0, 4]},
    specialized: [{term: 94, get: (value) => spec_callee[value] || -1}, {term: 56, get: (value) => spec_AtKeyword[value] || -1}, {term: 95, get: (value) => spec_identifier[value] || -1}],
    tokenPrec: 1078
  });

  // node_modules/@codemirror/lang-css/dist/index.js
  var _properties = null;
  function properties() {
    if (!_properties && typeof document == "object" && document.body) {
      let names = [];
      for (let prop in document.body.style) {
        if (!/[A-Z]|^-|^(item|length)$/.test(prop))
          names.push(prop);
      }
      _properties = names.sort().map((name2) => ({type: "property", label: name2}));
    }
    return _properties || [];
  }
  var pseudoClasses = /* @__PURE__ */ [
    "active",
    "after",
    "any-link",
    "autofill",
    "backdrop",
    "before",
    "checked",
    "cue",
    "default",
    "defined",
    "disabled",
    "empty",
    "enabled",
    "file-selector-button",
    "first",
    "first-child",
    "first-letter",
    "first-line",
    "first-of-type",
    "focus",
    "focus-visible",
    "focus-within",
    "fullscreen",
    "has",
    "host",
    "host-context",
    "hover",
    "in-range",
    "indeterminate",
    "invalid",
    "is",
    "lang",
    "last-child",
    "last-of-type",
    "left",
    "link",
    "marker",
    "modal",
    "not",
    "nth-child",
    "nth-last-child",
    "nth-last-of-type",
    "nth-of-type",
    "only-child",
    "only-of-type",
    "optional",
    "out-of-range",
    "part",
    "placeholder",
    "placeholder-shown",
    "read-only",
    "read-write",
    "required",
    "right",
    "root",
    "scope",
    "selection",
    "slotted",
    "target",
    "target-text",
    "valid",
    "visited",
    "where"
  ].map((name2) => ({type: "class", label: name2}));
  var values = /* @__PURE__ */ [
    "above",
    "absolute",
    "activeborder",
    "additive",
    "activecaption",
    "after-white-space",
    "ahead",
    "alias",
    "all",
    "all-scroll",
    "alphabetic",
    "alternate",
    "always",
    "antialiased",
    "appworkspace",
    "asterisks",
    "attr",
    "auto",
    "auto-flow",
    "avoid",
    "avoid-column",
    "avoid-page",
    "avoid-region",
    "axis-pan",
    "background",
    "backwards",
    "baseline",
    "below",
    "bidi-override",
    "blink",
    "block",
    "block-axis",
    "bold",
    "bolder",
    "border",
    "border-box",
    "both",
    "bottom",
    "break",
    "break-all",
    "break-word",
    "bullets",
    "button",
    "button-bevel",
    "buttonface",
    "buttonhighlight",
    "buttonshadow",
    "buttontext",
    "calc",
    "capitalize",
    "caps-lock-indicator",
    "caption",
    "captiontext",
    "caret",
    "cell",
    "center",
    "checkbox",
    "circle",
    "cjk-decimal",
    "clear",
    "clip",
    "close-quote",
    "col-resize",
    "collapse",
    "color",
    "color-burn",
    "color-dodge",
    "column",
    "column-reverse",
    "compact",
    "condensed",
    "contain",
    "content",
    "contents",
    "content-box",
    "context-menu",
    "continuous",
    "copy",
    "counter",
    "counters",
    "cover",
    "crop",
    "cross",
    "crosshair",
    "currentcolor",
    "cursive",
    "cyclic",
    "darken",
    "dashed",
    "decimal",
    "decimal-leading-zero",
    "default",
    "default-button",
    "dense",
    "destination-atop",
    "destination-in",
    "destination-out",
    "destination-over",
    "difference",
    "disc",
    "discard",
    "disclosure-closed",
    "disclosure-open",
    "document",
    "dot-dash",
    "dot-dot-dash",
    "dotted",
    "double",
    "down",
    "e-resize",
    "ease",
    "ease-in",
    "ease-in-out",
    "ease-out",
    "element",
    "ellipse",
    "ellipsis",
    "embed",
    "end",
    "ethiopic-abegede-gez",
    "ethiopic-halehame-aa-er",
    "ethiopic-halehame-gez",
    "ew-resize",
    "exclusion",
    "expanded",
    "extends",
    "extra-condensed",
    "extra-expanded",
    "fantasy",
    "fast",
    "fill",
    "fill-box",
    "fixed",
    "flat",
    "flex",
    "flex-end",
    "flex-start",
    "footnotes",
    "forwards",
    "from",
    "geometricPrecision",
    "graytext",
    "grid",
    "groove",
    "hand",
    "hard-light",
    "help",
    "hidden",
    "hide",
    "higher",
    "highlight",
    "highlighttext",
    "horizontal",
    "hsl",
    "hsla",
    "hue",
    "icon",
    "ignore",
    "inactiveborder",
    "inactivecaption",
    "inactivecaptiontext",
    "infinite",
    "infobackground",
    "infotext",
    "inherit",
    "initial",
    "inline",
    "inline-axis",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "inline-table",
    "inset",
    "inside",
    "intrinsic",
    "invert",
    "italic",
    "justify",
    "keep-all",
    "landscape",
    "large",
    "larger",
    "left",
    "level",
    "lighter",
    "lighten",
    "line-through",
    "linear",
    "linear-gradient",
    "lines",
    "list-item",
    "listbox",
    "listitem",
    "local",
    "logical",
    "loud",
    "lower",
    "lower-hexadecimal",
    "lower-latin",
    "lower-norwegian",
    "lowercase",
    "ltr",
    "luminosity",
    "manipulation",
    "match",
    "matrix",
    "matrix3d",
    "medium",
    "menu",
    "menutext",
    "message-box",
    "middle",
    "min-intrinsic",
    "mix",
    "monospace",
    "move",
    "multiple",
    "multiple_mask_images",
    "multiply",
    "n-resize",
    "narrower",
    "ne-resize",
    "nesw-resize",
    "no-close-quote",
    "no-drop",
    "no-open-quote",
    "no-repeat",
    "none",
    "normal",
    "not-allowed",
    "nowrap",
    "ns-resize",
    "numbers",
    "numeric",
    "nw-resize",
    "nwse-resize",
    "oblique",
    "opacity",
    "open-quote",
    "optimizeLegibility",
    "optimizeSpeed",
    "outset",
    "outside",
    "outside-shape",
    "overlay",
    "overline",
    "padding",
    "padding-box",
    "painted",
    "page",
    "paused",
    "perspective",
    "pinch-zoom",
    "plus-darker",
    "plus-lighter",
    "pointer",
    "polygon",
    "portrait",
    "pre",
    "pre-line",
    "pre-wrap",
    "preserve-3d",
    "progress",
    "push-button",
    "radial-gradient",
    "radio",
    "read-only",
    "read-write",
    "read-write-plaintext-only",
    "rectangle",
    "region",
    "relative",
    "repeat",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeat-x",
    "repeat-y",
    "reset",
    "reverse",
    "rgb",
    "rgba",
    "ridge",
    "right",
    "rotate",
    "rotate3d",
    "rotateX",
    "rotateY",
    "rotateZ",
    "round",
    "row",
    "row-resize",
    "row-reverse",
    "rtl",
    "run-in",
    "running",
    "s-resize",
    "sans-serif",
    "saturation",
    "scale",
    "scale3d",
    "scaleX",
    "scaleY",
    "scaleZ",
    "screen",
    "scroll",
    "scrollbar",
    "scroll-position",
    "se-resize",
    "self-start",
    "self-end",
    "semi-condensed",
    "semi-expanded",
    "separate",
    "serif",
    "show",
    "single",
    "skew",
    "skewX",
    "skewY",
    "skip-white-space",
    "slide",
    "slider-horizontal",
    "slider-vertical",
    "sliderthumb-horizontal",
    "sliderthumb-vertical",
    "slow",
    "small",
    "small-caps",
    "small-caption",
    "smaller",
    "soft-light",
    "solid",
    "source-atop",
    "source-in",
    "source-out",
    "source-over",
    "space",
    "space-around",
    "space-between",
    "space-evenly",
    "spell-out",
    "square",
    "start",
    "static",
    "status-bar",
    "stretch",
    "stroke",
    "stroke-box",
    "sub",
    "subpixel-antialiased",
    "svg_masks",
    "super",
    "sw-resize",
    "symbolic",
    "symbols",
    "system-ui",
    "table",
    "table-caption",
    "table-cell",
    "table-column",
    "table-column-group",
    "table-footer-group",
    "table-header-group",
    "table-row",
    "table-row-group",
    "text",
    "text-bottom",
    "text-top",
    "textarea",
    "textfield",
    "thick",
    "thin",
    "threeddarkshadow",
    "threedface",
    "threedhighlight",
    "threedlightshadow",
    "threedshadow",
    "to",
    "top",
    "transform",
    "translate",
    "translate3d",
    "translateX",
    "translateY",
    "translateZ",
    "transparent",
    "ultra-condensed",
    "ultra-expanded",
    "underline",
    "unidirectional-pan",
    "unset",
    "up",
    "upper-latin",
    "uppercase",
    "url",
    "var",
    "vertical",
    "vertical-text",
    "view-box",
    "visible",
    "visibleFill",
    "visiblePainted",
    "visibleStroke",
    "visual",
    "w-resize",
    "wait",
    "wave",
    "wider",
    "window",
    "windowframe",
    "windowtext",
    "words",
    "wrap",
    "wrap-reverse",
    "x-large",
    "x-small",
    "xor",
    "xx-large",
    "xx-small"
  ].map((name2) => ({type: "keyword", label: name2})).concat(/* @__PURE__ */ [
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "grey",
    "green",
    "greenyellow",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen"
  ].map((name2) => ({type: "constant", label: name2})));
  var tags2 = /* @__PURE__ */ [
    "a",
    "abbr",
    "address",
    "article",
    "aside",
    "b",
    "bdi",
    "bdo",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "dfn",
    "dialog",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "footer",
    "form",
    "header",
    "hgroup",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "html",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "label",
    "legend",
    "li",
    "main",
    "meter",
    "nav",
    "ol",
    "output",
    "p",
    "pre",
    "ruby",
    "section",
    "select",
    "small",
    "source",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "template",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul"
  ].map((name2) => ({type: "type", label: name2}));
  var identifier2 = /^[\w-]*/;
  var cssCompletionSource = (context) => {
    let {state, pos} = context, node = syntaxTree(state).resolveInner(pos, -1);
    if (node.name == "PropertyName")
      return {from: node.from, options: properties(), validFor: identifier2};
    if (node.name == "ValueName")
      return {from: node.from, options: values, validFor: identifier2};
    if (node.name == "PseudoClassName")
      return {from: node.from, options: pseudoClasses, validFor: identifier2};
    if (node.name == "TagName") {
      for (let {parent} = node; parent; parent = parent.parent)
        if (parent.name == "Block")
          return {from: node.from, options: properties(), validFor: identifier2};
      return {from: node.from, options: tags2, validFor: identifier2};
    }
    if (!context.explicit)
      return null;
    let above = node.resolve(pos), before = above.childBefore(pos);
    if (before && before.name == ":" && above.name == "PseudoClassSelector")
      return {from: pos, options: pseudoClasses, validFor: identifier2};
    if (before && before.name == ":" && above.name == "Declaration" || above.name == "ArgList")
      return {from: pos, options: values, validFor: identifier2};
    if (above.name == "Block")
      return {from: pos, options: properties(), validFor: identifier2};
    return null;
  };
  var cssLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "css",
    parser: /* @__PURE__ */ parser2.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          Declaration: /* @__PURE__ */ continuedIndent()
        }),
        /* @__PURE__ */ foldNodeProp.add({
          Block: foldInside
        })
      ]
    }),
    languageData: {
      commentTokens: {block: {open: "/*", close: "*/"}},
      indentOnInput: /^\s*\}$/,
      wordChars: "-"
    }
  });
  function css() {
    return new LanguageSupport(cssLanguage, cssLanguage.data.of({autocomplete: cssCompletionSource}));
  }

  // node_modules/@lezer/html/dist/index.es.js
  var scriptText = 53;
  var StartCloseScriptTag = 1;
  var styleText = 54;
  var StartCloseStyleTag = 2;
  var textareaText = 55;
  var StartCloseTextareaTag = 3;
  var StartTag = 4;
  var StartScriptTag = 5;
  var StartStyleTag = 6;
  var StartTextareaTag = 7;
  var StartSelfClosingTag = 8;
  var StartCloseTag = 9;
  var NoMatchStartCloseTag = 10;
  var MismatchedStartCloseTag = 11;
  var missingCloseTag = 56;
  var IncompleteCloseTag = 12;
  var commentContent$1 = 57;
  var Element = 18;
  var ScriptText = 27;
  var StyleText = 30;
  var TextareaText = 33;
  var OpenTag = 35;
  var Dialect_noMatch = 0;
  var selfClosers = {
    area: true,
    base: true,
    br: true,
    col: true,
    command: true,
    embed: true,
    frame: true,
    hr: true,
    img: true,
    input: true,
    keygen: true,
    link: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true,
    menuitem: true
  };
  var implicitlyClosed = {
    dd: true,
    li: true,
    optgroup: true,
    option: true,
    p: true,
    rp: true,
    rt: true,
    tbody: true,
    td: true,
    tfoot: true,
    th: true,
    tr: true
  };
  var closeOnOpen = {
    dd: {dd: true, dt: true},
    dt: {dd: true, dt: true},
    li: {li: true},
    option: {option: true, optgroup: true},
    optgroup: {optgroup: true},
    p: {
      address: true,
      article: true,
      aside: true,
      blockquote: true,
      dir: true,
      div: true,
      dl: true,
      fieldset: true,
      footer: true,
      form: true,
      h1: true,
      h2: true,
      h3: true,
      h4: true,
      h5: true,
      h6: true,
      header: true,
      hgroup: true,
      hr: true,
      menu: true,
      nav: true,
      ol: true,
      p: true,
      pre: true,
      section: true,
      table: true,
      ul: true
    },
    rp: {rp: true, rt: true},
    rt: {rp: true, rt: true},
    tbody: {tbody: true, tfoot: true},
    td: {td: true, th: true},
    tfoot: {tbody: true},
    th: {td: true, th: true},
    thead: {tbody: true, tfoot: true},
    tr: {tr: true}
  };
  function nameChar(ch) {
    return ch == 45 || ch == 46 || ch == 58 || ch >= 65 && ch <= 90 || ch == 95 || ch >= 97 && ch <= 122 || ch >= 161;
  }
  function isSpace(ch) {
    return ch == 9 || ch == 10 || ch == 13 || ch == 32;
  }
  var cachedName = null;
  var cachedInput = null;
  var cachedPos = 0;
  function tagNameAfter(input, offset) {
    let pos = input.pos + offset;
    if (cachedPos == pos && cachedInput == input)
      return cachedName;
    let next = input.peek(offset);
    while (isSpace(next))
      next = input.peek(++offset);
    let name2 = "";
    for (; ; ) {
      if (!nameChar(next))
        break;
      name2 += String.fromCharCode(next);
      next = input.peek(++offset);
    }
    cachedInput = input;
    cachedPos = pos;
    return cachedName = name2 ? name2.toLowerCase() : next == question || next == bang ? void 0 : null;
  }
  var lessThan = 60;
  var greaterThan = 62;
  var slash = 47;
  var question = 63;
  var bang = 33;
  var dash2 = 45;
  function ElementContext(name2, parent) {
    this.name = name2;
    this.parent = parent;
    this.hash = parent ? parent.hash : 0;
    for (let i = 0; i < name2.length; i++)
      this.hash += (this.hash << 4) + name2.charCodeAt(i) + (name2.charCodeAt(i) << 8);
  }
  var startTagTerms = [StartTag, StartSelfClosingTag, StartScriptTag, StartStyleTag, StartTextareaTag];
  var elementContext = new ContextTracker({
    start: null,
    shift(context, term, stack, input) {
      return startTagTerms.indexOf(term) > -1 ? new ElementContext(tagNameAfter(input, 1) || "", context) : context;
    },
    reduce(context, term) {
      return term == Element && context ? context.parent : context;
    },
    reuse(context, node, stack, input) {
      let type = node.type.id;
      return type == StartTag || type == OpenTag ? new ElementContext(tagNameAfter(input, 1) || "", context) : context;
    },
    hash(context) {
      return context ? context.hash : 0;
    },
    strict: false
  });
  var tagStart = new ExternalTokenizer((input, stack) => {
    if (input.next != lessThan) {
      if (input.next < 0 && stack.context)
        input.acceptToken(missingCloseTag);
      return;
    }
    input.advance();
    let close = input.next == slash;
    if (close)
      input.advance();
    let name2 = tagNameAfter(input, 0);
    if (name2 === void 0)
      return;
    if (!name2)
      return input.acceptToken(close ? IncompleteCloseTag : StartTag);
    let parent = stack.context ? stack.context.name : null;
    if (close) {
      if (name2 == parent)
        return input.acceptToken(StartCloseTag);
      if (parent && implicitlyClosed[parent])
        return input.acceptToken(missingCloseTag, -2);
      if (stack.dialectEnabled(Dialect_noMatch))
        return input.acceptToken(NoMatchStartCloseTag);
      for (let cx = stack.context; cx; cx = cx.parent)
        if (cx.name == name2)
          return;
      input.acceptToken(MismatchedStartCloseTag);
    } else {
      if (name2 == "script")
        return input.acceptToken(StartScriptTag);
      if (name2 == "style")
        return input.acceptToken(StartStyleTag);
      if (name2 == "textarea")
        return input.acceptToken(StartTextareaTag);
      if (selfClosers.hasOwnProperty(name2))
        return input.acceptToken(StartSelfClosingTag);
      if (parent && closeOnOpen[parent] && closeOnOpen[parent][name2])
        input.acceptToken(missingCloseTag, -1);
      else
        input.acceptToken(StartTag);
    }
  }, {contextual: true});
  var commentContent = new ExternalTokenizer((input) => {
    for (let dashes = 0, i = 0; ; i++) {
      if (input.next < 0) {
        if (i)
          input.acceptToken(commentContent$1);
        break;
      }
      if (input.next == dash2) {
        dashes++;
      } else if (input.next == greaterThan && dashes >= 2) {
        if (i > 3)
          input.acceptToken(commentContent$1, -2);
        break;
      } else {
        dashes = 0;
      }
      input.advance();
    }
  });
  function contentTokenizer(tag, textToken, endToken) {
    let lastState = 2 + tag.length;
    return new ExternalTokenizer((input) => {
      for (let state = 0, matchedLen = 0, i = 0; ; i++) {
        if (input.next < 0) {
          if (i)
            input.acceptToken(textToken);
          break;
        }
        if (state == 0 && input.next == lessThan || state == 1 && input.next == slash || state >= 2 && state < lastState && input.next == tag.charCodeAt(state - 2)) {
          state++;
          matchedLen++;
        } else if ((state == 2 || state == lastState) && isSpace(input.next)) {
          matchedLen++;
        } else if (state == lastState && input.next == greaterThan) {
          if (i > matchedLen)
            input.acceptToken(textToken, -matchedLen);
          else
            input.acceptToken(endToken, -(matchedLen - 2));
          break;
        } else if ((input.next == 10 || input.next == 13) && i) {
          input.acceptToken(textToken, 1);
          break;
        } else {
          state = matchedLen = 0;
        }
        input.advance();
      }
    });
  }
  var scriptTokens = contentTokenizer("script", scriptText, StartCloseScriptTag);
  var styleTokens = contentTokenizer("style", styleText, StartCloseStyleTag);
  var textareaTokens = contentTokenizer("textarea", textareaText, StartCloseTextareaTag);
  var htmlHighlighting = styleTags({
    "Text RawText": tags.content,
    "StartTag StartCloseTag SelfCloserEndTag EndTag SelfCloseEndTag": tags.angleBracket,
    TagName: tags.tagName,
    "MismatchedCloseTag/TagName": [tags.tagName, tags.invalid],
    AttributeName: tags.attributeName,
    "AttributeValue UnquotedAttributeValue": tags.attributeValue,
    Is: tags.definitionOperator,
    "EntityReference CharacterReference": tags.character,
    Comment: tags.blockComment,
    ProcessingInst: tags.processingInstruction,
    DoctypeDecl: tags.documentMeta
  });
  var parser3 = LRParser.deserialize({
    version: 14,
    states: ",xOVOxOOO!WQ!bO'#CoO!]Q!bO'#CyO!bQ!bO'#C|O!gQ!bO'#DPO!lQ!bO'#DRO!qOXO'#CnO!|OYO'#CnO#XO[O'#CnO$eOxO'#CnOOOW'#Cn'#CnO$lO!rO'#DSO$tQ!bO'#DUO$yQ!bO'#DVOOOW'#Dj'#DjOOOW'#DX'#DXQVOxOOO%OQ#tO,59ZO%WQ#tO,59eO%`Q#tO,59hO%hQ#tO,59kO%pQ#tO,59mOOOX'#D]'#D]O%xOXO'#CwO&TOXO,59YOOOY'#D^'#D^O&]OYO'#CzO&hOYO,59YOOO['#D_'#D_O&pO[O'#C}O&{O[O,59YOOOW'#D`'#D`O'TOxO,59YO'[Q!bO'#DQOOOW,59Y,59YOOO`'#Da'#DaO'aO!rO,59nOOOW,59n,59nO'iQ!bO,59pO'nQ!bO,59qOOOW-E7V-E7VO'sQ#tO'#CqOOQO'#DY'#DYO(OQ#tO1G.uOOOX1G.u1G.uO(WQ#tO1G/POOOY1G/P1G/PO(`Q#tO1G/SOOO[1G/S1G/SO(hQ#tO1G/VOOOW1G/V1G/VO(pQ#tO1G/XOOOW1G/X1G/XOOOX-E7Z-E7ZO(xQ!bO'#CxOOOW1G.t1G.tOOOY-E7[-E7[O(}Q!bO'#C{OOO[-E7]-E7]O)SQ!bO'#DOOOOW-E7^-E7^O)XQ!bO,59lOOO`-E7_-E7_OOOW1G/Y1G/YOOOW1G/[1G/[OOOW1G/]1G/]O)^Q&jO,59]OOQO-E7W-E7WOOOX7+$a7+$aOOOY7+$k7+$kOOO[7+$n7+$nOOOW7+$q7+$qOOOW7+$s7+$sO)iQ!bO,59dO)nQ!bO,59gO)sQ!bO,59jOOOW1G/W1G/WO)xO,UO'#CtO*ZO7[O'#CtOOQO1G.w1G.wOOOW1G/O1G/OOOOW1G/R1G/ROOOW1G/U1G/UOOOO'#DZ'#DZO*lO,UO,59`OOQO,59`,59`OOOO'#D['#D[O*}O7[O,59`OOOO-E7X-E7XOOQO1G.z1G.zOOOO-E7Y-E7Y",
    stateData: "+h~O!]OS~OSSOTPOUQOVROWTOY]OZ[O[^O^^O_^O`^Oa^Ow^Oz_O!cZO~OdaO~OdbO~OdcO~OddO~OdeO~O!VfOPkP!YkP~O!WiOQnP!YnP~O!XlORqP!YqP~OSSOTPOUQOVROWTOXqOY]OZ[O[^O^^O_^O`^Oa^Ow^O!cZO~O!YrO~P#dO!ZsO!duO~OdvO~OdwO~OfyOj|O~OfyOj!OO~OfyOj!QO~OfyOj!SO~OfyOj!UO~O!VfOPkX!YkX~OP!WO!Y!XO~O!WiOQnX!YnX~OQ!ZO!Y!XO~O!XlORqX!YqX~OR!]O!Y!XO~O!Y!XO~P#dOd!_O~O!ZsO!d!aO~Oj!bO~Oj!cO~Og!dOfeXjeX~OfyOj!fO~OfyOj!gO~OfyOj!hO~OfyOj!iO~OfyOj!jO~Od!kO~Od!lO~Od!mO~Oj!nO~Oi!qO!_!oO!a!pO~Oj!rO~Oj!sO~Oj!tO~O_!uO`!uOa!uO!_!wO!`!uO~O_!xO`!xOa!xO!a!wO!b!xO~O_!uO`!uOa!uO!_!{O!`!uO~O_!xO`!xOa!xO!a!{O!b!xO~O`_a!cwz!c~",
    goto: "%o!_PPPPPPPPPPPPPPPPPP!`!fP!lPP!xPP!{#O#R#X#[#_#e#h#k#q#w!`P!`!`P#}$T$k$q$w$}%T%Z%aPPPPPPPP%gX^OX`pXUOX`pezabcde{}!P!R!TR!q!dRhUR!XhXVOX`pRkVR!XkXWOX`pRnWR!XnXXOX`pQrXR!XpXYOX`pQ`ORx`Q{aQ}bQ!PcQ!RdQ!TeZ!e{}!P!R!TQ!v!oR!z!vQ!y!pR!|!yQgUR!VgQjVR!YjQmWR![mQpXR!^pQtZR!`tS_O`ToXp",
    nodeNames: "\u26A0 StartCloseTag StartCloseTag StartCloseTag StartTag StartTag StartTag StartTag StartTag StartCloseTag StartCloseTag StartCloseTag IncompleteCloseTag Document Text EntityReference CharacterReference InvalidEntity Element OpenTag TagName Attribute AttributeName Is AttributeValue UnquotedAttributeValue EndTag ScriptText CloseTag OpenTag StyleText CloseTag OpenTag TextareaText CloseTag OpenTag CloseTag SelfClosingTag Comment ProcessingInst MismatchedCloseTag CloseTag DoctypeDecl",
    maxTerm: 66,
    context: elementContext,
    nodeProps: [
      ["closedBy", -11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, "EndTag", -4, 19, 29, 32, 35, "CloseTag"],
      ["group", -9, 12, 15, 16, 17, 18, 38, 39, 40, 41, "Entity", 14, "Entity TextContent", -3, 27, 30, 33, "TextContent Entity"],
      ["openedBy", 26, "StartTag StartCloseTag", -4, 28, 31, 34, 36, "OpenTag"]
    ],
    propSources: [htmlHighlighting],
    skippedNodes: [0],
    repeatNodeCount: 9,
    tokenData: "!#b!aR!WOX$kXY)sYZ)sZ]$k]^)s^p$kpq)sqr$krs*zsv$kvw+dwx2yx}$k}!O3f!O!P$k!P!Q7_!Q![$k![!]8u!]!^$k!^!_>b!_!`!!p!`!a8T!a!c$k!c!}8u!}#R$k#R#S8u#S#T$k#T#o8u#o$f$k$f$g&R$g%W$k%W%o8u%o%p$k%p&a8u&a&b$k&b1p8u1p4U$k4U4d8u4d4e$k4e$IS8u$IS$I`$k$I`$Ib8u$Ib$Kh$k$Kh%#t8u%#t&/x$k&/x&Et8u&Et&FV$k&FV;'S8u;'S;:j<t;:j?&r$k?&r?Ah8u?Ah?BY$k?BY?Mn8u?Mn~$k!Z$vc^PiW!``!bpOX$kXZ&RZ]$k]^&R^p$kpq&Rqr$krs&qsv$kvw)Rwx'rx!P$k!P!Q&R!Q!^$k!^!_(k!_!a&R!a$f$k$f$g&R$g~$k!R&[V^P!``!bpOr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_~&Rq&xT^P!bpOv&qwx'Xx!^&q!^!_'g!_~&qP'^R^POv'Xw!^'X!_~'Xp'lQ!bpOv'gx~'ga'yU^P!``Or'rrs'Xsv'rw!^'r!^!_(]!_~'r`(bR!``Or(]sv(]w~(]!Q(rT!``!bpOr(krs'gsv(kwx(]x~(kW)WXiWOX)RZ])R^p)Rqr)Rsw)Rx!P)R!Q!^)R!a$f)R$g~)R!a*O^^P!``!bp!]^OX&RXY)sYZ)sZ]&R]^)s^p&Rpq)sqr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_~&R!Z+TT!_h^P!bpOv&qwx'Xx!^&q!^!_'g!_~&q!Z+kbiWa!ROX,sXZ.QZ],s]^.Q^p,sqr,srs.Qst/]tw,swx.Qx!P,s!P!Q.Q!Q!],s!]!^)R!^!a.Q!a$f,s$f$g.Q$g~,s!Z,xbiWOX,sXZ.QZ],s]^.Q^p,sqr,srs.Qst)Rtw,swx.Qx!P,s!P!Q.Q!Q!],s!]!^.i!^!a.Q!a$f,s$f$g.Q$g~,s!R.TTOp.Qqs.Qt!].Q!]!^.d!^~.Q!R.iO_!R!Z.pXiW_!ROX)RZ])R^p)Rqr)Rsw)Rx!P)R!Q!^)R!a$f)R$g~)R!Z/baiWOX0gXZ1qZ]0g]^1q^p0gqr0grs1qsw0gwx1qx!P0g!P!Q1q!Q!]0g!]!^)R!^!a1q!a$f0g$f$g1q$g~0g!Z0laiWOX0gXZ1qZ]0g]^1q^p0gqr0grs1qsw0gwx1qx!P0g!P!Q1q!Q!]0g!]!^2V!^!a1q!a$f0g$f$g1q$g~0g!R1tSOp1qq!]1q!]!^2Q!^~1q!R2VO`!R!Z2^XiW`!ROX)RZ])R^p)Rqr)Rsw)Rx!P)R!Q!^)R!a$f)R$g~)R!Z3SU!ax^P!``Or'rrs'Xsv'rw!^'r!^!_(]!_~'r!]3qe^PiW!``!bpOX$kXZ&RZ]$k]^&R^p$kpq&Rqr$krs&qsv$kvw)Rwx'rx}$k}!O5S!O!P$k!P!Q&R!Q!^$k!^!_(k!_!a&R!a$f$k$f$g&R$g~$k!]5_d^PiW!``!bpOX$kXZ&RZ]$k]^&R^p$kpq&Rqr$krs&qsv$kvw)Rwx'rx!P$k!P!Q&R!Q!^$k!^!_(k!_!`&R!`!a6m!a$f$k$f$g&R$g~$k!T6xV^P!``!bp!dQOr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_~&R!X7hX^P!``!bpOr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_!`&R!`!a8T!a~&R!X8`VjU^P!``!bpOr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_~&R!a9U!YfSdQ^PiW!``!bpOX$kXZ&RZ]$k]^&R^p$kpq&Rqr$krs&qsv$kvw)Rwx'rx}$k}!O8u!O!P8u!P!Q&R!Q![8u![!]8u!]!^$k!^!_(k!_!a&R!a!c$k!c!}8u!}#R$k#R#S8u#S#T$k#T#o8u#o$f$k$f$g&R$g$}$k$}%O8u%O%W$k%W%o8u%o%p$k%p&a8u&a&b$k&b1p8u1p4U8u4U4d8u4d4e$k4e$IS8u$IS$I`$k$I`$Ib8u$Ib$Je$k$Je$Jg8u$Jg$Kh$k$Kh%#t8u%#t&/x$k&/x&Et8u&Et&FV$k&FV;'S8u;'S;:j<t;:j?&r$k?&r?Ah8u?Ah?BY$k?BY?Mn8u?Mn~$k!a=Pe^PiW!``!bpOX$kXZ&RZ]$k]^&R^p$kpq&Rqr$krs&qsv$kvw)Rwx'rx!P$k!P!Q&R!Q!^$k!^!_(k!_!a&R!a$f$k$f$g&R$g;=`$k;=`<%l8u<%l~$k!R>iW!``!bpOq(kqr?Rrs'gsv(kwx(]x!a(k!a!bKj!b~(k!R?YZ!``!bpOr(krs'gsv(kwx(]x}(k}!O?{!O!f(k!f!gAR!g#W(k#W#XGz#X~(k!R@SV!``!bpOr(krs'gsv(kwx(]x}(k}!O@i!O~(k!R@rT!``!bp!cPOr(krs'gsv(kwx(]x~(k!RAYV!``!bpOr(krs'gsv(kwx(]x!q(k!q!rAo!r~(k!RAvV!``!bpOr(krs'gsv(kwx(]x!e(k!e!fB]!f~(k!RBdV!``!bpOr(krs'gsv(kwx(]x!v(k!v!wBy!w~(k!RCQV!``!bpOr(krs'gsv(kwx(]x!{(k!{!|Cg!|~(k!RCnV!``!bpOr(krs'gsv(kwx(]x!r(k!r!sDT!s~(k!RD[V!``!bpOr(krs'gsv(kwx(]x!g(k!g!hDq!h~(k!RDxW!``!bpOrDqrsEbsvDqvwEvwxFfx!`Dq!`!aGb!a~DqqEgT!bpOvEbvxEvx!`Eb!`!aFX!a~EbPEyRO!`Ev!`!aFS!a~EvPFXOzPqF`Q!bpzPOv'gx~'gaFkV!``OrFfrsEvsvFfvwEvw!`Ff!`!aGQ!a~FfaGXR!``zPOr(]sv(]w~(]!RGkT!``!bpzPOr(krs'gsv(kwx(]x~(k!RHRV!``!bpOr(krs'gsv(kwx(]x#c(k#c#dHh#d~(k!RHoV!``!bpOr(krs'gsv(kwx(]x#V(k#V#WIU#W~(k!RI]V!``!bpOr(krs'gsv(kwx(]x#h(k#h#iIr#i~(k!RIyV!``!bpOr(krs'gsv(kwx(]x#m(k#m#nJ`#n~(k!RJgV!``!bpOr(krs'gsv(kwx(]x#d(k#d#eJ|#e~(k!RKTV!``!bpOr(krs'gsv(kwx(]x#X(k#X#YDq#Y~(k!RKqW!``!bpOrKjrsLZsvKjvwLowxNPx!aKj!a!b! g!b~KjqL`T!bpOvLZvxLox!aLZ!a!bM^!b~LZPLrRO!aLo!a!bL{!b~LoPMORO!`Lo!`!aMX!a~LoPM^OwPqMcT!bpOvLZvxLox!`LZ!`!aMr!a~LZqMyQ!bpwPOv'gx~'gaNUV!``OrNPrsLosvNPvwLow!aNP!a!bNk!b~NPaNpV!``OrNPrsLosvNPvwLow!`NP!`!a! V!a~NPa! ^R!``wPOr(]sv(]w~(]!R! nW!``!bpOrKjrsLZsvKjvwLowxNPx!`Kj!`!a!!W!a~Kj!R!!aT!``!bpwPOr(krs'gsv(kwx(]x~(k!V!!{VgS^P!``!bpOr&Rrs&qsv&Rwx'rx!^&R!^!_(k!_~&R",
    tokenizers: [scriptTokens, styleTokens, textareaTokens, tagStart, commentContent, 0, 1, 2, 3, 4, 5],
    topRules: {Document: [0, 13]},
    dialects: {noMatch: 0},
    tokenPrec: 476
  });
  function getAttrs(element, input) {
    let attrs = Object.create(null);
    for (let att of element.firstChild.getChildren("Attribute")) {
      let name2 = att.getChild("AttributeName"), value = att.getChild("AttributeValue") || att.getChild("UnquotedAttributeValue");
      if (name2)
        attrs[input.read(name2.from, name2.to)] = !value ? "" : value.name == "AttributeValue" ? input.read(value.from + 1, value.to - 1) : input.read(value.from, value.to);
    }
    return attrs;
  }
  function maybeNest(node, input, tags3) {
    let attrs;
    for (let tag of tags3) {
      if (!tag.attrs || tag.attrs(attrs || (attrs = getAttrs(node.node.parent, input))))
        return {parser: tag.parser};
    }
    return null;
  }
  function configureNesting(tags3) {
    let script = [], style = [], textarea = [];
    for (let tag of tags3) {
      let array = tag.tag == "script" ? script : tag.tag == "style" ? style : tag.tag == "textarea" ? textarea : null;
      if (!array)
        throw new RangeError("Only script, style, and textarea tags can host nested parsers");
      array.push(tag);
    }
    return parseMixed((node, input) => {
      let id2 = node.type.id;
      if (id2 == ScriptText)
        return maybeNest(node, input, script);
      if (id2 == StyleText)
        return maybeNest(node, input, style);
      if (id2 == TextareaText)
        return maybeNest(node, input, textarea);
      return null;
    });
  }

  // node_modules/@lezer/javascript/dist/index.es.js
  var TSExtends = 1;
  var noSemi = 281;
  var incdec = 2;
  var incdecPrefix = 3;
  var templateContent = 282;
  var InterpolationStart = 4;
  var templateEnd = 283;
  var insertSemi = 284;
  var spaces = 286;
  var newline = 287;
  var LineComment = 5;
  var BlockComment = 6;
  var Dialect_ts = 1;
  var space2 = [
    9,
    10,
    11,
    12,
    13,
    32,
    133,
    160,
    5760,
    8192,
    8193,
    8194,
    8195,
    8196,
    8197,
    8198,
    8199,
    8200,
    8201,
    8202,
    8232,
    8233,
    8239,
    8287,
    12288
  ];
  var braceR = 125;
  var braceL = 123;
  var semicolon = 59;
  var slash2 = 47;
  var star = 42;
  var plus = 43;
  var minus = 45;
  var dollar = 36;
  var backtick = 96;
  var backslash = 92;
  var trackNewline = new ContextTracker({
    start: false,
    shift(context, term) {
      return term == LineComment || term == BlockComment || term == spaces ? context : term == newline;
    },
    strict: false
  });
  var insertSemicolon = new ExternalTokenizer((input, stack) => {
    let {next} = input;
    if ((next == braceR || next == -1 || stack.context) && stack.canShift(insertSemi))
      input.acceptToken(insertSemi);
  }, {contextual: true, fallback: true});
  var noSemicolon = new ExternalTokenizer((input, stack) => {
    let {next} = input, after;
    if (space2.indexOf(next) > -1)
      return;
    if (next == slash2 && ((after = input.peek(1)) == slash2 || after == star))
      return;
    if (next != braceR && next != semicolon && next != -1 && !stack.context && stack.canShift(noSemi))
      input.acceptToken(noSemi);
  }, {contextual: true});
  var incdecToken = new ExternalTokenizer((input, stack) => {
    let {next} = input;
    if (next == plus || next == minus) {
      input.advance();
      if (next == input.next) {
        input.advance();
        let mayPostfix = !stack.context && stack.canShift(incdec);
        input.acceptToken(mayPostfix ? incdec : incdecPrefix);
      }
    }
  }, {contextual: true});
  var template = new ExternalTokenizer((input) => {
    for (let afterDollar = false, i = 0; ; i++) {
      let {next} = input;
      if (next < 0) {
        if (i)
          input.acceptToken(templateContent);
        break;
      } else if (next == backtick) {
        if (i)
          input.acceptToken(templateContent);
        else
          input.acceptToken(templateEnd, 1);
        break;
      } else if (next == braceL && afterDollar) {
        if (i == 1)
          input.acceptToken(InterpolationStart, 1);
        else
          input.acceptToken(templateContent, -1);
        break;
      } else if (next == 10 && i) {
        input.advance();
        input.acceptToken(templateContent);
        break;
      } else if (next == backslash) {
        input.advance();
      }
      afterDollar = next == dollar;
      input.advance();
    }
  });
  var tsExtends = new ExternalTokenizer((input, stack) => {
    if (input.next != 101 || !stack.dialectEnabled(Dialect_ts))
      return;
    input.advance();
    for (let i = 0; i < 6; i++) {
      if (input.next != "xtends".charCodeAt(i))
        return;
      input.advance();
    }
    if (input.next >= 57 && input.next <= 65 || input.next >= 48 && input.next <= 90 || input.next == 95 || input.next >= 97 && input.next <= 122 || input.next > 160)
      return;
    input.acceptToken(TSExtends);
  });
  var jsHighlight = styleTags({
    "get set async static": tags.modifier,
    "for while do if else switch try catch finally return throw break continue default case": tags.controlKeyword,
    "in of await yield void typeof delete instanceof": tags.operatorKeyword,
    "let var const function class extends": tags.definitionKeyword,
    "import export from": tags.moduleKeyword,
    "with debugger as new": tags.keyword,
    TemplateString: tags.special(tags.string),
    super: tags.atom,
    BooleanLiteral: tags.bool,
    this: tags.self,
    null: tags.null,
    Star: tags.modifier,
    VariableName: tags.variableName,
    "CallExpression/VariableName TaggedTemplateExpression/VariableName": tags.function(tags.variableName),
    VariableDefinition: tags.definition(tags.variableName),
    Label: tags.labelName,
    PropertyName: tags.propertyName,
    PrivatePropertyName: tags.special(tags.propertyName),
    "CallExpression/MemberExpression/PropertyName": tags.function(tags.propertyName),
    "FunctionDeclaration/VariableDefinition": tags.function(tags.definition(tags.variableName)),
    "ClassDeclaration/VariableDefinition": tags.definition(tags.className),
    PropertyDefinition: tags.definition(tags.propertyName),
    PrivatePropertyDefinition: tags.definition(tags.special(tags.propertyName)),
    UpdateOp: tags.updateOperator,
    LineComment: tags.lineComment,
    BlockComment: tags.blockComment,
    Number: tags.number,
    String: tags.string,
    ArithOp: tags.arithmeticOperator,
    LogicOp: tags.logicOperator,
    BitOp: tags.bitwiseOperator,
    CompareOp: tags.compareOperator,
    RegExp: tags.regexp,
    Equals: tags.definitionOperator,
    Arrow: tags.function(tags.punctuation),
    ": Spread": tags.punctuation,
    "( )": tags.paren,
    "[ ]": tags.squareBracket,
    "{ }": tags.brace,
    "InterpolationStart InterpolationEnd": tags.special(tags.brace),
    ".": tags.derefOperator,
    ", ;": tags.separator,
    TypeName: tags.typeName,
    TypeDefinition: tags.definition(tags.typeName),
    "type enum interface implements namespace module declare": tags.definitionKeyword,
    "abstract global Privacy readonly override": tags.modifier,
    "is keyof unique infer": tags.operatorKeyword,
    JSXAttributeValue: tags.attributeValue,
    JSXText: tags.content,
    "JSXStartTag JSXStartCloseTag JSXSelfCloseEndTag JSXEndTag": tags.angleBracket,
    "JSXIdentifier JSXNameSpacedName": tags.tagName,
    "JSXAttribute/JSXIdentifier JSXAttribute/JSXNameSpacedName": tags.attributeName
  });
  var spec_identifier2 = {__proto__: null, export: 18, as: 23, from: 29, default: 32, async: 37, function: 38, this: 48, true: 56, false: 56, void: 66, typeof: 70, null: 86, super: 88, new: 122, await: 139, yield: 141, delete: 142, class: 152, extends: 154, public: 197, private: 197, protected: 197, readonly: 199, instanceof: 220, in: 222, const: 224, import: 256, keyof: 307, unique: 311, infer: 317, is: 351, abstract: 371, implements: 373, type: 375, let: 378, var: 380, interface: 387, enum: 391, namespace: 397, module: 399, declare: 403, global: 407, for: 428, of: 437, while: 440, with: 444, do: 448, if: 452, else: 454, switch: 458, case: 464, try: 470, catch: 474, finally: 478, return: 482, throw: 486, break: 490, continue: 494, debugger: 498};
  var spec_word = {__proto__: null, async: 109, get: 111, set: 113, public: 161, private: 161, protected: 161, static: 163, abstract: 165, override: 167, readonly: 173, new: 355};
  var spec_LessThan = {__proto__: null, "<": 129};
  var parser4 = LRParser.deserialize({
    version: 14,
    states: "$8SO`QdOOO'QQ(C|O'#ChO'XOWO'#DVO)dQdO'#D]O)tQdO'#DhO){QdO'#DrO-xQdO'#DxOOQO'#E]'#E]O.]Q`O'#E[O.bQ`O'#E[OOQ(C['#Ef'#EfO0aQ(C|O'#ItO2wQ(C|O'#IuO3eQ`O'#EzO3jQ!bO'#FaOOQ(C['#FS'#FSO3rO#tO'#FSO4QQ&jO'#FhO5bQ`O'#FgOOQ(C['#Iu'#IuOOQ(CW'#It'#ItOOQS'#J^'#J^O5gQ`O'#HpO5lQ(ChO'#HqOOQS'#Ih'#IhOOQS'#Hr'#HrQ`QdOOO){QdO'#DjO5tQ`O'#G[O5yQ&jO'#CmO6XQ`O'#EZO6dQ`O'#EgO6iQ,UO'#FRO7TQ`O'#G[O7YQ`O'#G`O7eQ`O'#G`O7sQ`O'#GcO7sQ`O'#GdO7sQ`O'#GfO5tQ`O'#GiO8dQ`O'#GlO9rQ`O'#CdO:SQ`O'#GyO:[Q`O'#HPO:[Q`O'#HRO`QdO'#HTO:[Q`O'#HVO:[Q`O'#HYO:aQ`O'#H`O:fQ(CjO'#HfO){QdO'#HhO:qQ(CjO'#HjO:|Q(CjO'#HlO5lQ(ChO'#HnO){QdO'#DWOOOW'#Ht'#HtO;XOWO,59qOOQ(C[,59q,59qO=jQtO'#ChO=tQdO'#HuO>XQ`O'#IvO@WQtO'#IvO'dQdO'#IvO@_Q`O,59wO@uQ7[O'#DbOAnQ`O'#E]OA{Q`O'#JROBWQ`O'#JQOBWQ`O'#JQOB`Q`O,5:yOBeQ`O'#JPOBlQaO'#DyO5yQ&jO'#EZOBzQ`O'#EZOCVQpO'#FROOQ(C[,5:S,5:SOC_QdO,5:SOE]Q(C|O,5:^OEyQ`O,5:dOFdQ(ChO'#JOO7YQ`O'#I}OFkQ`O'#I}OFsQ`O,5:xOFxQ`O'#I}OGWQdO,5:vOIWQ&jO'#EWOJeQ`O,5:vOKwQ&jO'#DlOLOQdO'#DqOLYQ7[O,5;PO){QdO,5;POOQS'#Er'#ErOOQS'#Et'#EtO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;RO){QdO,5;ROOQS'#Ex'#ExOLbQdO,5;cOOQ(C[,5;h,5;hOOQ(C[,5;i,5;iONbQ`O,5;iOOQ(C[,5;j,5;jO){QdO'#IPONgQ(ChO,5<TO! RQ&jO,5;RO){QdO,5;fO! kQ!bO'#JVO! YQ!bO'#JVO! rQ!bO'#JVO!!TQ!bO,5;qOOOO,5;{,5;{O!!cQdO'#FcOOOO'#IO'#IOO3rO#tO,5;nO!!jQ!bO'#FeOOQ(C[,5;n,5;nO!#WQ,VO'#CrOOQ(C]'#Cu'#CuO!#kQ`O'#CuO!#pOWO'#CyO!$^Q,VO,5<QO!$eQ`O,5<SO!%tQ&jO'#FrO!&RQ`O'#FsO!&WQ`O'#FsO!&]Q&jO'#FwO!'[Q7[O'#F{O!'}Q,VO'#IqOOQ(C]'#Iq'#IqO!(XQaO'#IpO!(gQ`O'#IoO!(oQ`O'#CqOOQ(C]'#Cs'#CsOOQ(C]'#C|'#C|O!(wQ`O'#DOOJjQ&jO'#FjOJjQ&jO'#FlO!(|Q`O'#FnO!)RQ`O'#FoO!&WQ`O'#FuOJjQ&jO'#FzO!)WQ`O'#E^O!)oQ`O,5<RO`QdO,5>[OOQS'#Ik'#IkOOQS,5>],5>]OOQS-E;p-E;pO!+kQ(C|O,5:UOOQ(CX'#Cp'#CpO!,[Q&kO,5<vOOQO'#Cf'#CfO!,mQ(ChO'#IlO5bQ`O'#IlO:aQ`O,59XO!-OQ!bO,59XO!-WQ&jO,59XO5yQ&jO,59XO!-cQ`O,5:vO!-kQ`O'#GxO!-yQ`O'#JbO){QdO,5;kO!.RQ7[O,5;mO!.WQ`O,5=cO!.]Q`O,5=cO!.bQ`O,5=cO5lQ(ChO,5=cO5tQ`O,5<vO!.pQ`O'#E_O!/UQ7[O'#E`OOQ(CW'#JP'#JPO!/gQ(ChO'#J_O5lQ(ChO,5<zO7sQ`O,5=QOOQP'#Cr'#CrO!/rQ!bO,5<}O!/zQ!cO,5=OO!0VQ`O,5=QO!0[QpO,5=TO:aQ`O'#GnO5tQ`O'#GpO!0dQ`O'#GpO5yQ&jO'#GsO!0iQ`O'#GsOOQS,5=W,5=WO!0nQ`O'#GtO!0vQ`O'#CmO!0{Q`O,59OO!1VQ`O,59OO!3XQdO,59OOOQS,59O,59OO!3fQ(ChO,59OO){QdO,59OO!3qQdO'#G{OOQS'#G|'#G|OOQS'#G}'#G}O`QdO,5=eO!4RQ`O,5=eO){QdO'#DxO`QdO,5=kO`QdO,5=mO!4WQ`O,5=oO`QdO,5=qO!4]Q`O,5=tO!4bQdO,5=zOOQS,5>Q,5>QO){QdO,5>QO5lQ(ChO,5>SOOQS,5>U,5>UO!8cQ`O,5>UOOQS,5>W,5>WO!8cQ`O,5>WOOQS,5>Y,5>YO!8hQpO,59rOOOW-E;r-E;rOOQ(C[1G/]1G/]O!8mQtO,5>aO'dQdO,5>aOOQO,5>f,5>fO!8wQdO'#HuOOQO-E;s-E;sO!9UQ`O,5?bO!9^QtO,5?bO!9eQ`O,5?lOOQ(C[1G/c1G/cO!9mQ!bO'#DTOOQO'#Ix'#IxO){QdO'#IxO!:[Q!bO'#IxO!:yQ!bO'#DcO!;[Q7[O'#DcO!=gQdO'#DcO!=nQ`O'#IwO!=vQ`O,59|O!={Q`O'#EaO!>ZQ`O'#JSO!>cQ`O,5:zO!>yQ7[O'#DcO){QdO,5?mO!?TQ`O'#HzOOQO-E;x-E;xO!9eQ`O,5?lOOQ(CW1G0e1G0eO!@aQ7[O'#D|OOQ(C[,5:e,5:eO){QdO,5:eOIWQ&jO,5:eO!@hQaO,5:eO:aQ`O,5:uO!-OQ!bO,5:uO!-WQ&jO,5:uO5yQ&jO,5:uOOQ(C[1G/n1G/nOOQ(C[1G0O1G0OOOQ(CW'#EV'#EVO){QdO,5?jO!@sQ(ChO,5?jO!AUQ(ChO,5?jO!A]Q`O,5?iO!AeQ`O'#H|O!A]Q`O,5?iOOQ(CW1G0d1G0dO7YQ`O,5?iOOQ(C[1G0b1G0bO!BPQ(C|O1G0bO!CRQ(CyO,5:rOOQ(C]'#Fq'#FqO!CoQ(C}O'#IqOGWQdO1G0bO!EqQ,VO'#IyO!E{Q`O,5:WO!FQQtO'#IzO){QdO'#IzO!F[Q`O,5:]OOQ(C]'#DT'#DTOOQ(C[1G0k1G0kO!FaQ`O1G0kO!HrQ(C|O1G0mO!HyQ(C|O1G0mO!K^Q(C|O1G0mO!KeQ(C|O1G0mO!MlQ(C|O1G0mO!NPQ(C|O1G0mO#!pQ(C|O1G0mO#!wQ(C|O1G0mO#%[Q(C|O1G0mO#%cQ(C|O1G0mO#'WQ(C|O1G0mO#*QQMlO'#ChO#+{QMlO1G0}O#-vQMlO'#IuOOQ(C[1G1T1G1TO#.ZQ(C|O,5>kOOQ(CW-E;}-E;}O#.zQ(C}O1G0mOOQ(C[1G0m1G0mO#1PQ(C|O1G1QO#1pQ!bO,5;sO#1uQ!bO,5;tO#1zQ!bO'#F[O#2`Q`O'#FZOOQO'#JW'#JWOOQO'#H}'#H}O#2eQ!bO1G1]OOQ(C[1G1]1G1]OOOO1G1f1G1fO#2sQMlO'#ItO#2}Q`O,5;}OLbQdO,5;}OOOO-E;|-E;|OOQ(C[1G1Y1G1YOOQ(C[,5<P,5<PO#3SQ!bO,5<POOQ(C],59a,59aOIWQ&jO'#C{OOOW'#Hs'#HsO#3XOWO,59eOOQ(C],59e,59eO){QdO1G1lO!)RQ`O'#IRO#3dQ`O,5<eOOQ(C],5<b,5<bOOQO'#GV'#GVOJjQ&jO,5<pOOQO'#GX'#GXOJjQ&jO,5<rOIWQ&jO,5<tOOQO1G1n1G1nO#3oQqO'#CpO#4SQqO,5<^O#4ZQ`O'#JZO5tQ`O'#JZO#4iQ`O,5<`OJjQ&jO,5<_O#4nQ`O'#FtO#4yQ`O,5<_O#5OQqO'#FqO#5]QqO'#J[O#5gQ`O'#J[OIWQ&jO'#J[O#5lQ`O,5<cOOQ(CW'#Dg'#DgO#5qQ!bO'#F|O!'VQ7[O'#F|O!'VQ7[O'#GOO#6SQ`O'#GPO!&WQ`O'#GSO#6XQ(ChO'#ITO#6dQ7[O,5<gOOQ(C],5<g,5<gO#6kQ7[O'#F|O#6yQ7[O'#F}O#7RQ7[O'#F}OOQ(C],5<u,5<uOJjQ&jO,5?[OJjQ&jO,5?[O#7WQ`O'#IUO#7cQ`O,5?ZO#7kQ`O,59]OOQ(C]'#Ch'#ChO#8[Q,VO,59jOOQ(C],59j,59jO#8}Q,VO,5<UO#9pQ,VO,5<WO#9zQ`O,5<YOOQ(C],5<Z,5<ZO#:PQ`O,5<aO#:UQ,VO,5<fOGWQdO1G1mO#:fQ`O1G1mOOQS1G3v1G3vOOQ(C[1G/p1G/pONbQ`O1G/pOOQS1G2b1G2bOIWQ&jO1G2bO){QdO1G2bOIWQ&jO1G2bO#:kQaO1G2bO#<QQ&jO'#EWOOQ(CW,5?W,5?WO#<[Q(ChO,5?WOOQS1G.s1G.sO:aQ`O1G.sO!-OQ!bO1G.sO!-WQ&jO1G.sO#<mQ`O1G0bO#<rQ`O'#ChO#<}Q`O'#JcO#=VQ`O,5=dO#=[Q`O'#JcO#=aQ`O'#JcO#=iQ`O'#I^O#=wQ`O,5?|O#>PQtO1G1VOOQ(C[1G1X1G1XO5tQ`O1G2}O#>WQ`O1G2}O#>]Q`O1G2}O#>bQ`O1G2}OOQS1G2}1G2}O#>gQ&kO1G2bO7YQ`O'#JQO7YQ`O'#EaO7YQ`O'#IWO#>xQ(ChO,5?yOOQS1G2f1G2fO!0VQ`O1G2lOIWQ&jO1G2iO#?TQ`O1G2iOOQS1G2j1G2jOIWQ&jO1G2jO#?YQaO1G2jO#?bQ7[O'#GhOOQS1G2l1G2lO!'VQ7[O'#IYO!0[QpO1G2oOOQS1G2o1G2oOOQS,5=Y,5=YO#?jQ&kO,5=[O5tQ`O,5=[O#6SQ`O,5=_O5bQ`O,5=_O!-OQ!bO,5=_O!-WQ&jO,5=_O5yQ&jO,5=_O#?{Q`O'#JaO#@WQ`O,5=`OOQS1G.j1G.jO#@]Q(ChO1G.jO#@hQ`O1G.jO#@mQ`O1G.jO5lQ(ChO1G.jO#@uQtO,5@OO#APQ`O,5@OO#A[QdO,5=gO#AcQ`O,5=gO7YQ`O,5@OOOQS1G3P1G3PO`QdO1G3POOQS1G3V1G3VOOQS1G3X1G3XO:[Q`O1G3ZO#AhQdO1G3]O#EcQdO'#H[OOQS1G3`1G3`O#EpQ`O'#HbO:aQ`O'#HdOOQS1G3f1G3fO#ExQdO1G3fO5lQ(ChO1G3lOOQS1G3n1G3nOOQ(CW'#Fx'#FxO5lQ(ChO1G3pO5lQ(ChO1G3rOOOW1G/^1G/^O#IvQpO,5<TO#JOQtO1G3{OOQO1G4Q1G4QO){QdO,5>aO#JYQ`O1G4|O#JbQ`O1G5WO#JjQ`O,5?dOLbQdO,5:{O7YQ`O,5:{O:aQ`O,59}OLbQdO,59}O!-OQ!bO,59}O#JoQMlO,59}OOQO,5:{,5:{O#JyQ7[O'#HvO#KaQ`O,5?cOOQ(C[1G/h1G/hO#KiQ7[O'#H{O#K}Q`O,5?nOOQ(CW1G0f1G0fO!;[Q7[O,59}O#LVQtO1G5XO7YQ`O,5>fOOQ(CW'#ES'#ESO#LaQ(DjO'#ETO!@XQ7[O'#D}OOQO'#Hy'#HyO#L{Q7[O,5:hOOQ(C[,5:h,5:hO#MSQ7[O'#D}O#MeQ7[O'#D}O#MlQ7[O'#EYO#MoQ7[O'#ETO#M|Q7[O'#ETO!@XQ7[O'#ETO#NaQ`O1G0PO#NfQqO1G0POOQ(C[1G0P1G0PO){QdO1G0POIWQ&jO1G0POOQ(C[1G0a1G0aO:aQ`O1G0aO!-OQ!bO1G0aO!-WQ&jO1G0aO#NmQ(C|O1G5UO){QdO1G5UO#N}Q(ChO1G5UO$ `Q`O1G5TO7YQ`O,5>hOOQO,5>h,5>hO$ hQ`O,5>hOOQO-E;z-E;zO$ `Q`O1G5TO$ vQ(C}O,59jO$#xQ(C}O,5<UO$%}Q(C}O,5<WO$(SQ(C}O,5<fOOQ(C[7+%|7+%|O$*_Q(C|O7+%|O$+OQ&jO'#HwO$+YQ`O,5?eOOQ(C]1G/r1G/rO$+bQdO'#HxO$+oQ`O,5?fO$+wQtO,5?fOOQ(C[1G/w1G/wOOQ(C[7+&V7+&VO$,RQMlO,5:^O){QdO7+&iO$,]QMlO,5:UOOQO1G1_1G1_OOQO1G1`1G1`O$,jQ!LQO,5;vOLbQdO,5;uOOQO-E;{-E;{OOQ(C[7+&w7+&wOOOO7+'Q7+'QOOOO1G1i1G1iO$,uQ`O1G1iOOQ(C[1G1k1G1kO$,zQqO,59gOOOW-E;q-E;qOOQ(C]1G/P1G/PO$-RQ(C|O7+'WOOQ(C],5>m,5>mO$-rQ`O,5>mOOQ(C]1G2P1G2PP$-wQ`O'#IRPOQ(C]-E<P-E<PO$.hQ,VO1G2[O$/ZQ,VO1G2^O$/eQqO1G2`OOQ(C]1G1x1G1xO$/lQ`O'#IQO$/zQ`O,5?uO$/zQ`O,5?uO$0SQ`O,5?uO$0_Q`O,5?uOOQO1G1z1G1zO$0mQ,VO1G1yOJjQ&jO1G1yO$0}Q&jO'#ISO$1_Q`O,5?vOIWQ&jO,5?vO$1gQqO,5?vOOQ(C]1G1}1G1}OOQ(CW,5<h,5<hOOQ(CW,5<i,5<iO$1qQ`O,5<iO#5}Q`O,5<iO!-OQ!bO,5<hO$1vQ`O,5<jOOQ(CW,5<k,5<kO$1qQ`O,5<nOOQO,5>o,5>oOOQO-E<R-E<ROOQ(C]1G2R1G2RO!'VQ7[O,5<hO$2OQ`O,5<iO!'VQ7[O,5<jO!'VQ7[O,5<iO$2ZQ,VO1G4vO$2eQ,VO1G4vOOQO,5>p,5>pOOQO-E<S-E<SOOQP1G.w1G.wO!.RQ7[O,59lO){QdO,59lO$2rQ`O1G1tOJjQ&jO1G1{O$2wQ(C|O7+'XOOQ(C[7+'X7+'XOGWQdO7+'XOOQ(C[7+%[7+%[O$3hQqO'#J]O#NaQ`O7+'|O$3rQ`O7+'|O$3zQqO7+'|OOQS7+'|7+'|OIWQ&jO7+'|O){QdO7+'|OIWQ&jO7+'|O$4UQ(CyO'#ChO$4iQ(CyO,5<lO$5ZQ`O,5<lOOQ(CW1G4r1G4rOOQS7+$_7+$_O:aQ`O7+$_O!-OQ!bO7+$_OGWQdO7+%|O$5`Q`O'#I]O$5qQ`O,5?}OOQO1G3O1G3OO5tQ`O,5?}O$5qQ`O,5?}O$5yQ`O,5?}OOQO,5>x,5>xOOQO-E<[-E<[OOQ(C[7+&q7+&qO$6OQ`O7+(iO5lQ(ChO7+(iO5tQ`O7+(iO$6TQ`O7+(iO$6YQaO7+'|OOQ(CW,5>r,5>rOOQ(CW-E<U-E<UOOQS7+(W7+(WO$6hQ(CyO7+(TOIWQ&jO7+(TO$6rQqO7+(UOOQS7+(U7+(UOIWQ&jO7+(UO$6yQ`O'#J`O$7UQ`O,5=SOOQO,5>t,5>tOOQO-E<W-E<WOOQS7+(Z7+(ZO$8OQ7[O'#GqOOQS1G2v1G2vOIWQ&jO1G2vO){QdO1G2vOIWQ&jO1G2vO$8VQaO1G2vO$8eQ&kO1G2vO5lQ(ChO1G2yO#6SQ`O1G2yO5bQ`O1G2yO!-OQ!bO1G2yO!-WQ&jO1G2yO$8vQ`O'#I[O$9RQ`O,5?{O$9ZQ7[O,5?{OOQ(CW1G2z1G2zOOQS7+$U7+$UO$9cQ`O7+$UO5lQ(ChO7+$UO$9hQ`O7+$UO){QdO1G5jO){QdO1G5kO$9mQdO1G3RO$9tQ`O1G3RO$9yQdO1G3RO$:QQ(ChO1G5jOOQS7+(k7+(kO5lQ(ChO7+(uO`QdO7+(wOOQS'#Jf'#JfOOQS'#I_'#I_O$:[QdO,5=vOOQS,5=v,5=vO){QdO'#H]O$:iQ`O'#H_OOQS,5=|,5=|O7YQ`O,5=|OOQS,5>O,5>OOOQS7+)Q7+)QOOQS7+)W7+)WOOQS7+)[7+)[OOQS7+)^7+)^OOQO1G5O1G5OO$:nQMlO1G0gO$:xQ`O1G0gOOQO1G/i1G/iO$;TQMlO1G/iO:aQ`O1G/iOLbQdO'#DcOOQO,5>b,5>bOOQO-E;t-E;tOOQO,5>g,5>gOOQO-E;y-E;yO!-OQ!bO1G/iO:aQ`O,5:iOOQO,5:o,5:oO){QdO,5:oO$;_Q(ChO,5:oO$;jQ(ChO,5:oO!-OQ!bO,5:iOOQO-E;w-E;wOOQ(C[1G0S1G0SO!@XQ7[O,5:iO$;xQ7[O,5:iO$<ZQ(DjO,5:oO$<uQ7[O,5:iO!@XQ7[O,5:oOOQO,5:t,5:tO$<|Q7[O,5:oO$=ZQ(ChO,5:oOOQ(C[7+%k7+%kO#NaQ`O7+%kO#NfQqO7+%kOOQ(C[7+%{7+%{O:aQ`O7+%{O!-OQ!bO7+%{O$=oQ(C|O7+*pO){QdO7+*pOOQO1G4S1G4SO7YQ`O1G4SO$>PQ`O7+*oO$>XQ(C}O1G2[O$@^Q(C}O1G2^O$BcQ(C}O1G1yO$DnQ,VO,5>cOOQO-E;u-E;uO$DxQtO,5>dO){QdO,5>dOOQO-E;v-E;vO$ESQ`O1G5QO$E[QMlO1G0bO$GcQMlO1G0mO$GjQMlO1G0mO$IkQMlO1G0mO$IrQMlO1G0mO$KgQMlO1G0mO$KzQMlO1G0mO$NXQMlO1G0mO$N`QMlO1G0mO%!aQMlO1G0mO%!hQMlO1G0mO%$]QMlO1G0mO%$pQ(C|O<<JTO%%rQMmO1G0mO%'|QMmO'#IqO%)iQMlO1G1QOLbQdO'#F^OOQO'#JX'#JXOOQO1G1b1G1bO%)vQ`O1G1aO%){QMlO,5>kOOOO7+'T7+'TOOOW1G/R1G/ROOQ(C]1G4X1G4XOJjQ&jO7+'zO%*VQ`O,5>lO5tQ`O,5>lOOQO-E<O-E<OO%*eQ`O1G5aO%*eQ`O1G5aO%*mQ`O1G5aO%*xQ,VO7+'eO%+YQqO,5>nO%+dQ`O,5>nOIWQ&jO,5>nOOQO-E<Q-E<QO%+iQqO1G5bO%+sQ`O1G5bOOQ(CW1G2T1G2TO$1qQ`O1G2TOOQ(CW1G2S1G2SO%+{Q`O1G2UOIWQ&jO1G2UOOQ(CW1G2Y1G2YO!-OQ!bO1G2SO#5}Q`O1G2TO%,QQ`O1G2UO%,YQ`O1G2TOJjQ&jO7+*bOOQ(C]1G/W1G/WO%,eQ`O1G/WOOQ(C]7+'`7+'`O%,jQ,VO7+'gO%,zQ(C|O<<JsOOQ(C[<<Js<<JsOIWQ&jO'#IVO%-kQ`O,5?wOOQS<<Kh<<KhOIWQ&jO<<KhO#NaQ`O<<KhO%-sQ`O<<KhO%-{QqO<<KhOIWQ&jO1G2WOOQS<<Gy<<GyO:aQ`O<<GyO%.VQ(C|O<<IhOOQ(C[<<Ih<<IhOOQO,5>w,5>wO%.vQ`O,5>wO%.{Q`O,5>wOOQO-E<Z-E<ZO%/TQ`O1G5iO%/TQ`O1G5iO5tQ`O1G5iO%/]Q`O<<LTOOQS<<LT<<LTO%/bQ`O<<LTO5lQ(ChO<<LTO){QdO<<KhOIWQ&jO<<KhOOQS<<Ko<<KoO$6hQ(CyO<<KoOOQS<<Kp<<KpO$6rQqO<<KpO%/gQ7[O'#IXO%/rQ`O,5?zOLbQdO,5?zOOQS1G2n1G2nO#LaQ(DjO'#ETO!@XQ7[O'#GrOOQO'#IZ'#IZO%/zQ7[O,5=]OOQS,5=],5=]O%0RQ7[O'#ETO%0^Q7[O'#ETO%0uQ7[O'#ETO%1PQ7[O'#GrO%1bQ`O7+(bO%1gQ`O7+(bO%1oQqO7+(bOOQS7+(b7+(bOIWQ&jO7+(bO){QdO7+(bOIWQ&jO7+(bO%1yQaO7+(bOOQS7+(e7+(eO5lQ(ChO7+(eO#6SQ`O7+(eO5bQ`O7+(eO!-OQ!bO7+(eO%2XQ`O,5>vOOQO-E<Y-E<YOOQO'#Gu'#GuO%2dQ`O1G5gO5lQ(ChO<<GpOOQS<<Gp<<GpO%2lQ`O<<GpO%2qQ`O7++UO%2vQ`O7++VOOQS7+(m7+(mO%2{Q`O7+(mO%3QQdO7+(mO%3XQ`O7+(mO){QdO7++UO){QdO7++VOOQS<<La<<LaOOQS<<Lc<<LcOOQS-E<]-E<]OOQS1G3b1G3bO%3^Q`O,5=wOOQS,5=y,5=yO%3cQ`O1G3hOLbQdO7+&ROOQO7+%T7+%TO%3hQMlO1G5XO:aQ`O7+%TOOQO1G0T1G0TO%3rQ(C|O1G0ZOOQO1G0Z1G0ZO){QdO1G0ZO%3|Q(ChO1G0ZO:aQ`O1G0TO!-OQ!bO1G0TO!@XQ7[O1G0TO%4XQ(ChO1G0ZO%4gQ7[O1G0TO%4xQ(ChO1G0ZO%5^Q(DjO1G0ZO%5hQ7[O1G0TO!@XQ7[O1G0ZOOQ(C[<<IV<<IVOOQ(C[<<Ig<<IgO:aQ`O<<IgO%5oQ(C|O<<N[OOQO7+)n7+)nO%6PQ(C}O7+'eO%8[Q(C}O7+'gO%:gQtO1G4OO%:qQMlO7+%|O%;gQMmO,59jO%=hQMmO,5<UO%?lQMmO,5<WO%A[QMmO,5<fO%B}QMlO7+'WO%C[QMlO7+'XO%CiQ`O,5;xOOQO7+&{7+&{O%CnQ,VO<<KfOOQO1G4W1G4WO%CuQ`O1G4WO%DQQ`O1G4WO%D`Q`O7+*{O%D`Q`O7+*{OIWQ&jO1G4YO%DhQqO1G4YO%DrQ`O7+*|OOQ(CW7+'o7+'oO$1qQ`O7+'pO%DzQqO7+'pOOQ(CW7+'n7+'nO$1qQ`O7+'oO%ERQ`O7+'pOIWQ&jO7+'pO#5}Q`O7+'oO%EWQ,VO<<M|OOQ(C]7+$r7+$rO%EbQqO,5>qOOQO-E<T-E<TO#NaQ`OANASOOQSANASANASOIWQ&jOANASO%ElQ(CyO7+'rOOQSAN=eAN=eO5tQ`O1G4cOOQO1G4c1G4cO%E|Q`O1G4cO%FRQ`O7++TO%FRQ`O7++TO5lQ(ChOANAoO%FZQ`OANAoOOQSANAoANAoO%F`Q`OANASO%FhQqOANASOOQSANAZANAZOOQSANA[ANA[O%FrQ`O,5>sOOQO-E<V-E<VO%F}QMlO1G5fO#6SQ`O,5=^O5bQ`O,5=^O!-OQ!bO,5=^OOQO-E<X-E<XOOQS1G2w1G2wO$<ZQ(DjO,5:oO!@XQ7[O,5=^O%GXQ7[O,5=^O%GjQ7[O,5:oOOQS<<K|<<K|OIWQ&jO<<K|O%1bQ`O<<K|O%GtQ`O<<K|O%G|QqO<<K|O){QdO<<K|OIWQ&jO<<K|OOQS<<LP<<LPO5lQ(ChO<<LPO#6SQ`O<<LPO5bQ`O<<LPO%HWQ7[O1G4bO%H`Q`O7++ROOQSAN=[AN=[O5lQ(ChOAN=[OOQS<<Np<<NpOOQS<<Nq<<NqOOQS<<LX<<LXO%HhQ`O<<LXO%HmQdO<<LXO%HtQ`O<<NpO%HyQ`O<<NqOOQS1G3c1G3cO:aQ`O7+)SO%IOQMlO<<ImOOQO<<Ho<<HoOOQO7+%u7+%uO%3rQ(C|O7+%uO){QdO7+%uOOQO7+%o7+%oO:aQ`O7+%oO!-OQ!bO7+%oO%IYQ(ChO7+%uO!@XQ7[O7+%oO%IeQ(ChO7+%uO%IsQ7[O7+%oO%JUQ(ChO7+%uOOQ(C[AN?RAN?RO%JjQMlO<<JTO%JwQMmO1G1yO%MOQMmO1G2[O& SQMmO1G2^O&!rQMlO<<JsO&#PQMlO<<IhOOQO1G1d1G1dOJjQ&jOANAQOOQO7+)r7+)rO&#^Q`O7+)rO&#iQ`O<<NgO&#qQqO7+)tOOQ(CW<<K[<<K[O$1qQ`O<<K[OOQ(CW<<KZ<<KZO&#{QqO<<K[O$1qQ`O<<KZOOQSG26nG26nO#NaQ`OG26nOOQO7+)}7+)}O5tQ`O7+)}O&$SQ`O<<NoOOQSG27ZG27ZO5lQ(ChOG27ZOIWQ&jOG26nOLbQdO1G4_O&$[Q`O7++QO5lQ(ChO1G2xO#6SQ`O1G2xO5bQ`O1G2xO!-OQ!bO1G2xO!@XQ7[O1G2xO%5^Q(DjO1G0ZO&$dQ7[O1G2xO%1bQ`OANAhOOQSANAhANAhOIWQ&jOANAhO&$uQ`OANAhO&$}QqOANAhOOQSANAkANAkO5lQ(ChOANAkO#6SQ`OANAkOOQO'#Gv'#GvOOQO7+)|7+)|OOQSG22vG22vOOQSANAsANAsO&%XQ`OANAsOOQSAND[AND[OOQSAND]AND]OOQS<<Ln<<LnOOQO<<Ia<<IaO%3rQ(C|O<<IaOOQO<<IZ<<IZO:aQ`O<<IZO){QdO<<IaO!-OQ!bO<<IZO&%^Q(ChO<<IaO!@XQ7[O<<IZO&%iQ(ChO<<IaO&%wQMmO7+'eO&'jQMmO7+'gO&)]Q,VOG26lOOQO<<M^<<M^OOQ(CWAN@vAN@vO$1qQ`OAN@vOOQ(CWAN@uAN@uOOQSLD,YLD,YOOQO<<Mi<<MiOOQSLD,uLD,uO#NaQ`OLD,YO&)mQMlO7+)yOOQO7+(d7+(dO5lQ(ChO7+(dO#6SQ`O7+(dO5bQ`O7+(dO!-OQ!bO7+(dO!@XQ7[O7+(dOOQSG27SG27SO%1bQ`OG27SOIWQ&jOG27SOOQSG27VG27VO5lQ(ChOG27VOOQSG27_G27_OOQOAN>{AN>{OOQOAN>uAN>uO%3rQ(C|OAN>{O:aQ`OAN>uO){QdOAN>{O!-OQ!bOAN>uO&)wQ(ChOAN>{O&*SQ(C}OG26lOOQ(CWG26bG26bOOQS!$( t!$( tOOQO<<LO<<LOO5lQ(ChO<<LOO#6SQ`O<<LOO5bQ`O<<LOO!-OQ!bO<<LOOOQSLD,nLD,nO%1bQ`OLD,nOOQSLD,qLD,qOOQOG24gG24gOOQOG24aG24aO%3rQ(C|OG24gO:aQ`OG24aO){QdOG24gO&,pQ!LRO,5:rO&-gQ$ITO'#IqOOQOANAjANAjO5lQ(ChOANAjO#6SQ`OANAjO5bQ`OANAjOOQS!$(!Y!$(!YOOQOLD*RLD*ROOQOLD){LD){O%3rQ(C|OLD*RO&.ZQMmOG26lO&/|Q!LRO,59jO&0pQ!LRO,5<UO&1dQ!LRO,5<WO&2WQ!LRO,5<fOOQOG27UG27UO5lQ(ChOG27UO#6SQ`OG27UOOQO!$'Mm!$'MmO&2}Q!LRO1G2[O&3qQ!LRO1G2^O&4eQ!LRO1G1yOOQOLD,pLD,pO5lQ(ChOLD,pO&5[Q!LRO7+'eO&6RQ!LRO7+'gOOQO!$(![!$(![O&6xQ!LROG26lOLbQdO'#DrO&7oQtO'#ItOLbQdO'#DjO&7vQ(C|O'#ChO&8aQtO'#ChO&8qQdO,5:vO&:qQ&jO'#EWOLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO,5;ROLbQdO'#IPO&<OQ`O,5<TO&=eQ&jO,5;ROLbQdO,5;fO!(wQ`O'#DOO!(wQ`O'#DOO!(wQ`O'#DOOIWQ&jO'#FjO&:qQ&jO'#FjO&<WQ&jO'#FjOIWQ&jO'#FlO&:qQ&jO'#FlO&<WQ&jO'#FlOIWQ&jO'#FzO&:qQ&jO'#FzO&<WQ&jO'#FzOLbQdO,5?mO&8qQdO1G0bO&=lQMlO'#ChOLbQdO1G1lOIWQ&jO,5<pO&:qQ&jO,5<pO&<WQ&jO,5<pOIWQ&jO,5<rO&:qQ&jO,5<rO&<WQ&jO,5<rOIWQ&jO,5<_O&:qQ&jO,5<_O&<WQ&jO,5<_O&8qQdO1G1mOLbQdO7+&iOIWQ&jO1G1yO&:qQ&jO1G1yO&<WQ&jO1G1yOIWQ&jO1G1{O&:qQ&jO1G1{O&<WQ&jO1G1{O&8qQdO7+'XO&8qQdO7+%|O&=vQ`O7+'pOIWQ&jOANAQO&:qQ&jOANAQO&<WQ&jOANAQO&=vQ`O<<K[O&=vQ`OAN@vO&={Q`O'#E[O&>QQ`O'#E[O&>YQ`O'#EzO&>_Q`O'#EgO&>dQ`O'#JRO&>oQ`O'#JPO&>zQ`O,5:vO&?PQ,VO,5<QO&?WQ`O'#FsO&?]Q`O'#FsO&?bQ`O'#FsO&?gQ`O,5<RO&?oQ`O,5:vO&?wQMlO1G0}O&@OQ`O,5<_O&@TQ`O,5<_O&@YQ`O,5<_O&@_Q`O,5<aO&@dQ`O,5<aO&@iQ`O,5<aO&@nQ`O1G1mO&@sQ`O1G0bO&@xQ`O1G2UO&@}Q,VO<<KfO&AUQ,VO<<KfO&A]Q,VO<<KfO&AdQqO7+'pO&AkQ`O7+'pO&ApQqO<<K[O4QQ&jO'#FhO5bQ`O'#FgOBzQ`O'#EZOLbQdO,5;cO!&WQ`O'#FsO!&WQ`O'#FsO!&WQ`O'#FsO!&WQ`O'#FuO!&WQ`O'#FuO!&WQ`O'#FuO&AwQ`O,5<jOJjQ&jO7+'zOJjQ&jO7+'zOJjQ&jO7+'zOIWQ&jO1G2UO&BPQ`O1G2UOIWQ&jO7+'pO!'VQ7[O'#GOO$/eQqO1G2`O$/eQqO1G2`O$/eQqO1G2`O!'VQ7[O,5<jOIWQ&jO,5<tOIWQ&jO,5<tOIWQ&jO,5<t",
    stateData: "&B}~O'YOS'ZOSTOSUOS~OQTORTOXyO]cO_hObnOcmOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!TSO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!nlO#dsO#tpO#x^O%PqO%RtO%TrO%UrO%XuO%ZvO%^wO%_wO%axO%nzO%t{O%v|O%x}O%z!OO%}!PO&T!QO&Z!RO&]!SO&_!TO&a!UO&c!VO']PO'fQO'oYO'|aO~OQ[XZ[X_[Xj[Xu[Xv[Xx[X!R[X!a[X!b[X!d[X!j[X!{[X#WdX#[[X#][X#^[X#_[X#`[X#a[X#b[X#c[X#e[X#g[X#i[X#j[X#o[X'W[X'f[X'p[X'w[X'x[X~O!]$lX~P$zOS!WO'U!XO'V!ZO~OQTORTO]cOb!kOc!jOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!T!bO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!n!iO#t!lO#x^O']![O'fQO'oYO'|aO~O!Q!`O!R!]O!O'jP!O'tP~P'dO!S!mO~P`OQTORTO]cOb!kOc!jOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!T!bO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!n!iO#t!lO#x^O']9aO'fQO'oYO'|aO~OQTORTO]cOb!kOc!jOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!T!bO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!n!iO#t!lO#x^O'fQO'oYO'|aO~O!Q!rO#U!uO#V!rO']9bO!c'qP~P+{O#W!vO~O!]!wO#W!vO~OQ#^OZ#dOj#ROu!{Ov!{Ox!|O!R#bO!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO#g#WO#i#YO#j#ZO'fQO'p#[O'w!}O'x#OO~O_'hX'W'hX!c'hX!O'hX!T'hX%Q'hX!]'hX~P.jO!{#eO#o#eOQ'iXZ'iX_'iXj'iXu'iXv'iXx'iX!R'iX!a'iX!b'iX!d'iX!j'iX#['iX#]'iX#^'iX#_'iX#`'iX#a'iX#b'iX#e'iX#g'iX#i'iX#j'iX'f'iX'p'iX'w'iX'x'iX~O#c'iX'W'iX!O'iX!c'iXn'iX!T'iX%Q'iX!]'iX~P0zO!{#eO~O#z#fO$R#jO~O!T#kO#x^O$U#lO$W#nO~O]#qOh$QOj#rOk#qOl#qOq$ROs$SOx#yO!T#zO!_$XO!d#vO#V$YO#t$VO$_$TO$a$UO$d$WO']#pO'b$PO'f#sO'a'cP~O!d$ZO~O!]$]O~O_$^O'W$^O~O']$bO~O!d$ZO']$bO'^$dO'b$PO~Oc$jO!d$ZO']$bO~O#c#TO~O]$sOu$oO!T$lO!d$nO%R$rO']$bO'^$dO^(UP~O!n$tO~Ox$uO!T$vO']$bO~Ox$uO!T$vO%Z$zO']$bO~O']${O~O#dsO%RtO%TrO%UrO%XuO%ZvO%^wO%_wO~Ob%UOc%TO!n%RO%P%SO%c%QO~P7xOb%XOcmO!T%WO!nlO#dsO%PqO%TrO%UrO%XuO%ZvO%^wO%_wO%axO~O`%[O!{%_O%R%YO'^$dO~P8wO!d%`O!g%dO~O!d%eO~O!TSO~O_$^O'T%mO'W$^O~O_$^O'T%pO'W$^O~O_$^O'T%rO'W$^O~OS!WO'U!XO'V%vO~OQ[XZ[Xj[Xu[Xv[Xx[X!R[X!RdX!a[X!b[X!d[X!j[X!{[X!{dX#WdX#[[X#][X#^[X#_[X#`[X#a[X#b[X#c[X#e[X#g[X#i[X#j[X#o[X'f[X'p[X'w[X'x[X~O!O[X!OdX~P;dO!Q%xO!O&iX!O&nX!R&iX!R&nX~P'dO!R%zO!O'jX~OQ#^OZ#dOj#ROu!{Ov!{Ox!|O!R%zO!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO#g#WO#i#YO#j#ZO'fQO'p#[O'w!}O'x#OO~O!O'jX~P>aO!O&PO~Ox&SO!W&^O!X&VO!Y&VO'^$dO~O]&TOk&TO!Q&WO'g&QO!S'kP!S'vP~P@dO!O'sX!R'sX!]'sX!c'sX'p'sX~O!{'sX#W#PX!S'sX~PA]O!{&_O!O'uX!R'uX~O!R&`O!O'tX~O!O&cO~O!{#eO~PA]OP&gO!T&dO!o&fO']$bO~Oc&lO!d$ZO']$bO~Ou$oO!d$nO~O!S&mO~P`Ou!{Ov!{Ox!|O!b!yO!d!zO'fQOQ!faZ!faj!fa!R!fa!a!fa!j!fa#[!fa#]!fa#^!fa#_!fa#`!fa#a!fa#b!fa#c!fa#e!fa#g!fa#i!fa#j!fa'p!fa'w!fa'x!fa~O_!fa'W!fa!O!fa!c!fan!fa!T!fa%Q!fa!]!fa~PCfO!c&nO~O!]!wO!{&pO'p&oO!R'rX_'rX'W'rX~O!c'rX~PFOO!R&tO!c'qX~O!c&vO~Ox$uO!T$vO#V&wO']$bO~OQTORTO]cOb!kOc!jOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!TSO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!n!iO#t!lO#x^O']9aO'fQO'oYO'|aO~O]#qOh$QOj#rOk#qOl#qOq$ROs9tOx#yO!T#zO!_;eO!d#vO#V9}O#t$VO$_9wO$a9zO$d$WO']&{O'b$PO'f#sO~O#W&}O~O]#qOh$QOj#rOk#qOl#qOq$ROs$SOx#yO!T#zO!_$XO!d#vO#V$YO#t$VO$_$TO$a$UO$d$WO']&{O'b$PO'f#sO~O'a'mP~PJjO!Q'RO!c'nP~P){O'g'TO'oYO~OQ9^OR9^O]cOb;`Oc!jOhcOj9^OkcOlcOq9^Os9^OxRO{cO|cO}cO!T!bO!_9`O!dUO!g9^O!h9^O!i9^O!j9^O!k9^O!n!iO#t!lO#x^O']'cO'fQO'oYO'|;^O~O!d!zO~O!R#bO_$]a'W$]a!c$]a!O$]a!T$]a%Q$]a!]$]a~O#d'jO~PIWO!]'lO!T'yX#w'yX#z'yX$R'yX~Ou'mO~P! YOu'mO!T'yX#w'yX#z'yX$R'yX~O!T'oO#w'sO#z'nO$R'tO~O!Q'wO~PLbO#z#fO$R'zO~OP$eXu$eXx$eX!b$eX'w$eX'x$eX~OPfX!RfX!{fX'afX'a$eX~P!!rOk'|O~OS'}O'U(OO'V(QO~OP(ZOu(SOx(TO'w(VO'x(XO~O'a(RO~P!#{O'a([O~O]#qOh$QOj#rOk#qOl#qOq$ROs9tOx#yO!T#zO!_;eO!d#vO#V9}O#t$VO$_9wO$a9zO$d$WO'b$PO'f#sO~O!Q(`O'](]O!c'}P~P!$jO#W(bO~O!d(cO~O!Q(hO'](eO!O(OP~P!$jOj(uOx(mO!W(sO!X(lO!Y(lO!d(cO!x(tO$w(oO'^$dO'g(jO~O!S(rO~P!&jO!b!yOP'eXu'eXx'eX'w'eX'x'eX!R'eX!{'eX~O'a'eX#m'eX~P!'cOP(xO!{(wO!R'dX'a'dX~O!R(yO'a'cX~O']${O'a'cP~O'](|O~O!d)RO~O']&{O~Ox$uO!Q!rO!T$vO#U!uO#V!rO']$bO!c'qP~O!]!wO#W)VO~OQ#^OZ#dOj#ROu!{Ov!{Ox!|O!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO#g#WO#i#YO#j#ZO'fQO'p#[O'w!}O'x#OO~O_!^a!R!^a'W!^a!O!^a!c!^an!^a!T!^a%Q!^a!]!^a~P!)wOP)_O!T&dO!o)^O%Q)]O'b$PO~O!])aO!T'`X_'`X!R'`X'W'`X~O!d$ZO'b$PO~O!d$ZO']$bO'b$PO~O!]!wO#W&}O~O])lO%R)mO'])iO!S(VP~O!R)nO^(UX~O'g'TO~OZ)rO~O^)sO~O!T$lO']$bO'^$dO^(UP~Ox$uO!Q)xO!R&`O!T$vO']$bO!O'tP~O]&ZOk&ZO!Q)yO'g'TO!S'vP~O!R)zO_(RX'W(RX~O!{*OO'b$PO~OP*RO!T#zO'b$PO~O!T*TO~Ou*VO!TSO~O!n*[O~Oc*aO~O'](|O!S(TP~Oc$jO~O%RtO']${O~P8wOZ*gO^*fO~OQTORTO]cObnOcmOhcOjTOkcOlcOqTOsTOxRO{cO|cO}cO!_kO!dUO!gTO!hTO!iTO!jTO!kTO!nlO#x^O%PqO'fQO'oYO'|aO~O!T!bO#t!lO']9aO~P!1_O^*fO_$^O'W$^O~O_*kO#d*mO%T*mO%U*mO~P){O!d%`O~O%t*rO~O!T*tO~O&V*vO&X*wOQ&SaR&SaX&Sa]&Sa_&Sab&Sac&Sah&Saj&Sak&Sal&Saq&Sas&Sax&Sa{&Sa|&Sa}&Sa!T&Sa!_&Sa!d&Sa!g&Sa!h&Sa!i&Sa!j&Sa!k&Sa!n&Sa#d&Sa#t&Sa#x&Sa%P&Sa%R&Sa%T&Sa%U&Sa%X&Sa%Z&Sa%^&Sa%_&Sa%a&Sa%n&Sa%t&Sa%v&Sa%x&Sa%z&Sa%}&Sa&T&Sa&Z&Sa&]&Sa&_&Sa&a&Sa&c&Sa'S&Sa']&Sa'f&Sa'o&Sa'|&Sa!S&Sa%{&Sa`&Sa&Q&Sa~O']*|O~On+PO~O!O&ia!R&ia~P!)wO!Q+TO!O&iX!R&iX~P){O!R%zO!O'ja~O!O'ja~P>aO!R&`O!O'ta~O!RwX!R!ZX!SwX!S!ZX!]wX!]!ZX!d!ZX!{wX'b!ZX~O!]+YO!{+XO!R#TX!R'lX!S#TX!S'lX!]'lX!d'lX'b'lX~O!]+[O!d$ZO'b$PO!R!VX!S!VX~O]&ROk&ROx&SO'g(jO~OQ9^OR9^O]cOb;`Oc!jOhcOj9^OkcOlcOq9^Os9^OxRO{cO|cO}cO!T!bO!_9`O!dUO!g9^O!h9^O!i9^O!j9^O!k9^O!n!iO#t!lO#x^O'fQO'oYO'|;^O~O']:SO~P!;jO!R+`O!S'kX~O!S+bO~O!]+YO!{+XO!R#TX!S#TX~O!R+cO!S'vX~O!S+eO~O]&ROk&ROx&SO'^$dO'g(jO~O!X+fO!Y+fO~P!>hOx$uO!Q+hO!T$vO']$bO!O&nX!R&nX~O_+lO!W+oO!X+kO!Y+kO!r+sO!s+qO!t+rO!u+pO!x+tO'^$dO'g(jO'o+iO~O!S+nO~P!?iOP+yO!T&dO!o+xO~O!{,PO!R'ra!c'ra_'ra'W'ra~O!]!wO~P!@sO!R&tO!c'qa~Ox$uO!Q,SO!T$vO#U,UO#V,SO']$bO!R&pX!c&pX~O_#Oi!R#Oi'W#Oi!O#Oi!c#Oin#Oi!T#Oi%Q#Oi!]#Oi~P!)wOP;tOu(SOx(TO'w(VO'x(XO~O#W!za!R!za!c!za!{!za!T!za_!za'W!za!O!za~P!BpO#W'eXQ'eXZ'eX_'eXj'eXv'eX!a'eX!d'eX!j'eX#['eX#]'eX#^'eX#_'eX#`'eX#a'eX#b'eX#c'eX#e'eX#g'eX#i'eX#j'eX'W'eX'f'eX'p'eX!c'eX!O'eX!T'eXn'eX%Q'eX!]'eX~P!'cO!R,_O'a'mX~P!#{O'a,aO~O!R,bO!c'nX~P!)wO!c,eO~O!O,fO~OQ#^Ou!{Ov!{Ox!|O!b!yO!d!zO!j#^O'fQOZ#Zi_#Zij#Zi!R#Zi!a#Zi#]#Zi#^#Zi#_#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi'W#Zi'p#Zi'w#Zi'x#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~O#[#Zi~P!FfO#[#PO~P!FfOQ#^Ou!{Ov!{Ox!|O!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO'fQOZ#Zi_#Zi!R#Zi!a#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi'W#Zi'p#Zi'w#Zi'x#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~Oj#Zi~P!IQOj#RO~P!IQOQ#^Oj#ROu!{Ov!{Ox!|O!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO'fQO_#Zi!R#Zi#e#Zi#g#Zi#i#Zi#j#Zi'W#Zi'p#Zi'w#Zi'x#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~OZ#Zi!a#Zi#a#Zi#b#Zi#c#Zi~P!KlOZ#dO!a#TO#a#TO#b#TO#c#TO~P!KlOQ#^OZ#dOj#ROu!{Ov!{Ox!|O!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO'fQO_#Zi!R#Zi#g#Zi#i#Zi#j#Zi'W#Zi'p#Zi'x#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~O'w#Zi~P!NdO'w!}O~P!NdOQ#^OZ#dOj#ROu!{Ov!{Ox!|O!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO#g#WO'fQO'w!}O_#Zi!R#Zi#i#Zi#j#Zi'W#Zi'p#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~O'x#Zi~P##OO'x#OO~P##OOQ#^OZ#dOj#ROu!{Ov!{Ox!|O!a#TO!b!yO!d!zO!j#^O#[#PO#]#QO#^#QO#_#QO#`#SO#a#TO#b#TO#c#TO#e#UO#g#WO#i#YO'fQO'w!}O'x#OO~O_#Zi!R#Zi#j#Zi'W#Zi'p#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~P#%jOQ[XZ[Xj[Xu[Xv[Xx[X!a[X!b[X!d[X!j[X!{[X#WdX#[[X#][X#^[X#_[X#`[X#a[X#b[X#c[X#e[X#g[X#i[X#j[X#o[X'f[X'p[X'w[X'x[X!R[X!S[X~O#m[X~P#'}OQ#^OZ9rOj9gOu!{Ov!{Ox!|O!a9iO!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO#`9hO#a9iO#b9iO#c9iO#e9jO#g9lO#i9nO#j9oO'fQO'p#[O'w!}O'x#OO~O#m,hO~P#*XOQ'iXZ'iXj'iXu'iXv'iXx'iX!a'iX!b'iX!d'iX!j'iX#['iX#]'iX#^'iX#_'iX#`'iX#a'iX#b'iX#e'iX#g'iX#i'iX#j'iX'f'iX'p'iX'w'iX'x'iX!R'iX~O!{9sO#o9sO#c'iX#m'iX!S'iX~P#,SO_&sa!R&sa'W&sa!c&san&sa!O&sa!T&sa%Q&sa!]&sa~P!)wOQ#ZiZ#Zi_#Zij#Ziv#Zi!R#Zi!a#Zi!b#Zi!d#Zi!j#Zi#[#Zi#]#Zi#^#Zi#_#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi'W#Zi'f#Zi'p#Zi!O#Zi!c#Zin#Zi!T#Zi%Q#Zi!]#Zi~P!BpO_#ni!R#ni'W#ni!O#ni!c#nin#ni!T#ni%Q#ni!]#ni~P!)wO#z,jO~O#z,kO~O!]'lO!{,lO!T$OX#w$OX#z$OX$R$OX~O!Q,mO~O!T'oO#w,oO#z'nO$R,pO~O!R9pO!S'hX~P#*XO!S,qO~O$R,sO~OS'}O'U(OO'V,vO~O],yOk,yO!O,zO~O!RdX!]dX!cdX!c$eX'pdX~P!!rO!c-QO~P!BpO!R-RO!]!wO'p&oO!c'}X~O!c-WO~O!Q(`O']$bO!c'}P~O#W-YO~O!O$eX!R$eX!]$lX~P!!rO!R-ZO!O(OX~P!BpO!]-]O~O!O-_O~Oj-cO!]!wO!d$ZO'b$PO'p&oO~O!])aO~O_$^O!R-hO'W$^O~O!S-jO~P!&jO!X-kO!Y-kO'^$dO'g(jO~Ox-mO'g(jO~O!x-nO~O']${O!R&xX'a&xX~O!R(yO'a'ca~O'a-sO~Ou-tOv-tOx-uOPra'wra'xra!Rra!{ra~O'ara#mra~P#7pOu(SOx(TOP$^a'w$^a'x$^a!R$^a!{$^a~O'a$^a#m$^a~P#8fOu(SOx(TOP$`a'w$`a'x$`a!R$`a!{$`a~O'a$`a#m$`a~P#9XO]-vO~O#W-wO~O'a$na!R$na!{$na#m$na~P!#{O#W-zO~OP.TO!T&dO!o.SO%Q.RO~O]#qOj#rOk#qOl#qOq$ROs9tOx#yO!T#zO!_;eO!d#vO#V9}O#t$VO$_9wO$a9zO$d$WO'b$PO'f#sO~Oh.VO'].UO~P#:yO!])aO!T'`a_'`a!R'`a'W'`a~O#W.]O~OZ[X!RdX!SdX~O!R.^O!S(VX~O!S.`O~OZ.aO~O].cO'])iO~O!T$lO']$bO^'QX!R'QX~O!R)nO^(Ua~O!c.fO~P!)wO].hO~OZ.iO~O^.jO~OP.TO!T&dO!o.SO%Q.RO'b$PO~O!R)zO_(Ra'W(Ra~O!{.pO~OP.sO!T#zO~O'g'TO!S(SP~OP.}O!T.yO!o.|O%Q.{O'b$PO~OZ/XO!R/VO!S(TX~O!S/YO~O^/[O_$^O'W$^O~O]/]O~O]/^O'](|O~O#c/_O%r/`O~P0zO!{#eO#c/_O%r/`O~O_/aO~P){O_/cO~O%{/gOQ%yiR%yiX%yi]%yi_%yib%yic%yih%yij%yik%yil%yiq%yis%yix%yi{%yi|%yi}%yi!T%yi!_%yi!d%yi!g%yi!h%yi!i%yi!j%yi!k%yi!n%yi#d%yi#t%yi#x%yi%P%yi%R%yi%T%yi%U%yi%X%yi%Z%yi%^%yi%_%yi%a%yi%n%yi%t%yi%v%yi%x%yi%z%yi%}%yi&T%yi&Z%yi&]%yi&_%yi&a%yi&c%yi'S%yi']%yi'f%yi'o%yi'|%yi!S%yi`%yi&Q%yi~O`/mO!S/kO&Q/lO~P`O!TSO!d/oO~O&X*wOQ&SiR&SiX&Si]&Si_&Sib&Sic&Sih&Sij&Sik&Sil&Siq&Sis&Six&Si{&Si|&Si}&Si!T&Si!_&Si!d&Si!g&Si!h&Si!i&Si!j&Si!k&Si!n&Si#d&Si#t&Si#x&Si%P&Si%R&Si%T&Si%U&Si%X&Si%Z&Si%^&Si%_&Si%a&Si%n&Si%t&Si%v&Si%x&Si%z&Si%}&Si&T&Si&Z&Si&]&Si&_&Si&a&Si&c&Si'S&Si']&Si'f&Si'o&Si'|&Si!S&Si%{&Si`&Si&Q&Si~O!R#bOn$]a~O!O&ii!R&ii~P!)wO!R%zO!O'ji~O!R&`O!O'ti~O!O/uO~O!R!Va!S!Va~P#*XO]&ROk&RO!Q/{O'g(jO!R&jX!S&jX~P@dO!R+`O!S'ka~O]&ZOk&ZO!Q)yO'g'TO!R&oX!S&oX~O!R+cO!S'va~O!O'ui!R'ui~P!)wO_$^O!]!wO!d$ZO!j0VO!{0TO'W$^O'b$PO'p&oO~O!S0YO~P!?iO!X0ZO!Y0ZO'^$dO'g(jO'o+iO~O!W0[O~P#MSO!TSO!W0[O!u0^O!x0_O~P#MSO!W0[O!s0aO!t0aO!u0^O!x0_O~P#MSO!T&dO~O!T&dO~P!BpO!R'ri!c'ri_'ri'W'ri~P!)wO!{0jO!R'ri!c'ri_'ri'W'ri~O!R&tO!c'qi~Ox$uO!T$vO#V0lO']$bO~O#WraQraZra_rajra!ara!bra!dra!jra#[ra#]ra#^ra#_ra#`ra#ara#bra#cra#era#gra#ira#jra'Wra'fra'pra!cra!Ora!Tranra%Qra!]ra~P#7pO#W$^aQ$^aZ$^a_$^aj$^av$^a!a$^a!b$^a!d$^a!j$^a#[$^a#]$^a#^$^a#_$^a#`$^a#a$^a#b$^a#c$^a#e$^a#g$^a#i$^a#j$^a'W$^a'f$^a'p$^a!c$^a!O$^a!T$^an$^a%Q$^a!]$^a~P#8fO#W$`aQ$`aZ$`a_$`aj$`av$`a!a$`a!b$`a!d$`a!j$`a#[$`a#]$`a#^$`a#_$`a#`$`a#a$`a#b$`a#c$`a#e$`a#g$`a#i$`a#j$`a'W$`a'f$`a'p$`a!c$`a!O$`a!T$`an$`a%Q$`a!]$`a~P#9XO#W$naQ$naZ$na_$naj$nav$na!R$na!a$na!b$na!d$na!j$na#[$na#]$na#^$na#_$na#`$na#a$na#b$na#c$na#e$na#g$na#i$na#j$na'W$na'f$na'p$na!c$na!O$na!T$na!{$nan$na%Q$na!]$na~P!BpO_#Oq!R#Oq'W#Oq!O#Oq!c#Oqn#Oq!T#Oq%Q#Oq!]#Oq~P!)wO!R&kX'a&kX~PJjO!R,_O'a'ma~O!Q0tO!R&lX!c&lX~P){O!R,bO!c'na~O!R,bO!c'na~P!)wO#m!fa!S!fa~PCfO#m!^a!R!^a!S!^a~P#*XO!T1XO#x^O$P1YO~O!S1^O~On1_O~P!BpO_$Yq!R$Yq'W$Yq!O$Yq!c$Yqn$Yq!T$Yq%Q$Yq!]$Yq~P!)wO!O1`O~O],yOk,yO~Ou(SOx(TO'x(XOP$xi'w$xi!R$xi!{$xi~O'a$xi#m$xi~P$.POu(SOx(TOP$zi'w$zi'x$zi!R$zi!{$zi~O'a$zi#m$zi~P$.rO'p#[O~P!BpO!Q1cO']$bO!R&tX!c&tX~O!R-RO!c'}a~O!R-RO!]!wO!c'}a~O!R-RO!]!wO'p&oO!c'}a~O'a$gi!R$gi!{$gi#m$gi~P!#{O!Q1kO'](eO!O&vX!R&vX~P!$jO!R-ZO!O(Oa~O!R-ZO!O(Oa~P!BpO!]!wO~O!]!wO#c1sO~Oj1vO!]!wO'p&oO~O!R'di'a'di~P!#{O!{1yO!R'di'a'di~P!#{O!c1|O~O_$Zq!R$Zq'W$Zq!O$Zq!c$Zqn$Zq!T$Zq%Q$Zq!]$Zq~P!)wO!R2QO!T(PX~P!BpO!T&dO%Q2TO~O!T&dO%Q2TO~P!BpO!T$eX$u[X_$eX!R$eX'W$eX~P!!rO$u2XOPgXugXxgX!TgX'wgX'xgX_gX!RgX'WgX~O$u2XO~O]2_O%R2`O'])iO!R'PX!S'PX~O!R.^O!S(Va~OZ2dO~O^2eO~O]2hO~OP2jO!T&dO!o2iO%Q2TO~O_$^O'W$^O~P!BpO!T#zO~P!BpO!R2oO!{2qO!S(SX~O!S2rO~Ox;oO!W2{O!X2tO!Y2tO!r2zO!s2yO!t2yO!x2xO'^$dO'g(jO'o+iO~O!S2wO~P$7ZOP3SO!T.yO!o3RO%Q3QO~OP3SO!T.yO!o3RO%Q3QO'b$PO~O'](|O!R'OX!S'OX~O!R/VO!S(Ta~O]3^O'g3]O~O]3_O~O^3aO~O!c3dO~P){O_3fO~O_3fO~P){O#c3hO%r3iO~PFOO`/mO!S3mO&Q/lO~P`O!]3oO~O!R#Ti!S#Ti~P#*XO!{3qO!R#Ti!S#Ti~O!R!Vi!S!Vi~P#*XO_$^O!{3xO'W$^O~O_$^O!]!wO!{3xO'W$^O~O!X3|O!Y3|O'^$dO'g(jO'o+iO~O_$^O!]!wO!d$ZO!j3}O!{3xO'W$^O'b$PO'p&oO~O!W4OO~P$;xO!W4OO!u4RO!x4SO~P$;xO_$^O!]!wO!j3}O!{3xO'W$^O'p&oO~O!R'rq!c'rq_'rq'W'rq~P!)wO!R&tO!c'qq~O#W$xiQ$xiZ$xi_$xij$xiv$xi!a$xi!b$xi!d$xi!j$xi#[$xi#]$xi#^$xi#_$xi#`$xi#a$xi#b$xi#c$xi#e$xi#g$xi#i$xi#j$xi'W$xi'f$xi'p$xi!c$xi!O$xi!T$xin$xi%Q$xi!]$xi~P$.PO#W$ziQ$ziZ$zi_$zij$ziv$zi!a$zi!b$zi!d$zi!j$zi#[$zi#]$zi#^$zi#_$zi#`$zi#a$zi#b$zi#c$zi#e$zi#g$zi#i$zi#j$zi'W$zi'f$zi'p$zi!c$zi!O$zi!T$zin$zi%Q$zi!]$zi~P$.rO#W$giQ$giZ$gi_$gij$giv$gi!R$gi!a$gi!b$gi!d$gi!j$gi#[$gi#]$gi#^$gi#_$gi#`$gi#a$gi#b$gi#c$gi#e$gi#g$gi#i$gi#j$gi'W$gi'f$gi'p$gi!c$gi!O$gi!T$gi!{$gin$gi%Q$gi!]$gi~P!BpO!R&ka'a&ka~P!#{O!R&la!c&la~P!)wO!R,bO!c'ni~O#m#Oi!R#Oi!S#Oi~P#*XOQ#^Ou!{Ov!{Ox!|O!b!yO!d!zO!j#^O'fQOZ#Zij#Zi!a#Zi#]#Zi#^#Zi#_#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi#m#Zi'p#Zi'w#Zi'x#Zi!R#Zi!S#Zi~O#[#Zi~P$EiO#[9eO~P$EiOQ#^Ou!{Ov!{Ox!|O!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO'fQOZ#Zi!a#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi#m#Zi'p#Zi'w#Zi'x#Zi!R#Zi!S#Zi~Oj#Zi~P$GqOj9gO~P$GqOQ#^Oj9gOu!{Ov!{Ox!|O!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO#`9hO'fQO#e#Zi#g#Zi#i#Zi#j#Zi#m#Zi'p#Zi'w#Zi'x#Zi!R#Zi!S#Zi~OZ#Zi!a#Zi#a#Zi#b#Zi#c#Zi~P$IyOZ9rO!a9iO#a9iO#b9iO#c9iO~P$IyOQ#^OZ9rOj9gOu!{Ov!{Ox!|O!a9iO!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO#`9hO#a9iO#b9iO#c9iO#e9jO'fQO#g#Zi#i#Zi#j#Zi#m#Zi'p#Zi'x#Zi!R#Zi!S#Zi~O'w#Zi~P$L_O'w!}O~P$L_OQ#^OZ9rOj9gOu!{Ov!{Ox!|O!a9iO!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO#`9hO#a9iO#b9iO#c9iO#e9jO#g9lO'fQO'w!}O#i#Zi#j#Zi#m#Zi'p#Zi!R#Zi!S#Zi~O'x#Zi~P$NgO'x#OO~P$NgOQ#^OZ9rOj9gOu!{Ov!{Ox!|O!a9iO!b!yO!d!zO!j#^O#[9eO#]9fO#^9fO#_9fO#`9hO#a9iO#b9iO#c9iO#e9jO#g9lO#i9nO'fQO'w!}O'x#OO~O#j#Zi#m#Zi'p#Zi!R#Zi!S#Zi~P%!oO_#ky!R#ky'W#ky!O#ky!c#kyn#ky!T#ky%Q#ky!]#ky~P!)wOP;vOu(SOx(TO'w(VO'x(XO~OQ#ZiZ#Zij#Ziv#Zi!a#Zi!b#Zi!d#Zi!j#Zi#[#Zi#]#Zi#^#Zi#_#Zi#`#Zi#a#Zi#b#Zi#c#Zi#e#Zi#g#Zi#i#Zi#j#Zi#m#Zi'f#Zi'p#Zi!R#Zi!S#Zi~P%%aO!b!yOP'eXu'eXx'eX'w'eX'x'eX!S'eX~OQ'eXZ'eXj'eXv'eX!a'eX!d'eX!j'eX#['eX#]'eX#^'eX#_'eX#`'eX#a'eX#b'eX#c'eX#e'eX#g'eX#i'eX#j'eX#m'eX'f'eX'p'eX!R'eX~P%'eO#m#ni!R#ni!S#ni~P#*XO!S4eO~O!R&sa!S&sa~P#*XO!]!wO'p&oO!R&ta!c&ta~O!R-RO!c'}i~O!R-RO!]!wO!c'}i~O'a$gq!R$gq!{$gq#m$gq~P!#{O!O&va!R&va~P!BpO!]4lO~O!R-ZO!O(Oi~P!BpO!R-ZO!O(Oi~O!O4pO~O!]!wO#c4uO~Oj4vO!]!wO'p&oO~O!O4xO~O'a$iq!R$iq!{$iq#m$iq~P!#{O_$Zy!R$Zy'W$Zy!O$Zy!c$Zyn$Zy!T$Zy%Q$Zy!]$Zy~P!)wO!R2QO!T(Pa~O!T&dO%Q4}O~O!T&dO%Q4}O~P!BpO_#Oy!R#Oy'W#Oy!O#Oy!c#Oyn#Oy!T#Oy%Q#Oy!]#Oy~P!)wOZ5QO~O]5SO'])iO~O!R.^O!S(Vi~O]5VO~O^5WO~O'g'TO!R&{X!S&{X~O!R2oO!S(Sa~O!S5eO~P$7ZOx;sO'g(jO'o+iO~O!W5hO!X5gO!Y5gO!x0_O'^$dO'g(jO'o+iO~O!s5iO!t5iO~P%0^O!X5gO!Y5gO'^$dO'g(jO'o+iO~O!T.yO~O!T.yO%Q5kO~O!T.yO%Q5kO~P!BpOP5pO!T.yO!o5oO%Q5kO~OZ5uO!R'Oa!S'Oa~O!R/VO!S(Ti~O]5xO~O!c5yO~O!c5zO~O!c5{O~O!c5{O~P){O_5}O~O!]6QO~O!c6RO~O!R'ui!S'ui~P#*XO_$^O'W$^O~P!)wO_$^O!{6WO'W$^O~O_$^O!]!wO!{6WO'W$^O~O!X6]O!Y6]O'^$dO'g(jO'o+iO~O_$^O!]!wO!j6^O!{6WO'W$^O'p&oO~O!d$ZO'b$PO~P%4xO!W6_O~P%4gO!R'ry!c'ry_'ry'W'ry~P!)wO#W$gqQ$gqZ$gq_$gqj$gqv$gq!R$gq!a$gq!b$gq!d$gq!j$gq#[$gq#]$gq#^$gq#_$gq#`$gq#a$gq#b$gq#c$gq#e$gq#g$gq#i$gq#j$gq'W$gq'f$gq'p$gq!c$gq!O$gq!T$gq!{$gqn$gq%Q$gq!]$gq~P!BpO#W$iqQ$iqZ$iq_$iqj$iqv$iq!R$iq!a$iq!b$iq!d$iq!j$iq#[$iq#]$iq#^$iq#_$iq#`$iq#a$iq#b$iq#c$iq#e$iq#g$iq#i$iq#j$iq'W$iq'f$iq'p$iq!c$iq!O$iq!T$iq!{$iqn$iq%Q$iq!]$iq~P!BpO!R&li!c&li~P!)wO#m#Oq!R#Oq!S#Oq~P#*XOu-tOv-tOx-uOPra'wra'xra!Sra~OQraZrajra!ara!bra!dra!jra#[ra#]ra#^ra#_ra#`ra#ara#bra#cra#era#gra#ira#jra#mra'fra'pra!Rra~P%;OOu(SOx(TOP$^a'w$^a'x$^a!S$^a~OQ$^aZ$^aj$^av$^a!a$^a!b$^a!d$^a!j$^a#[$^a#]$^a#^$^a#_$^a#`$^a#a$^a#b$^a#c$^a#e$^a#g$^a#i$^a#j$^a#m$^a'f$^a'p$^a!R$^a~P%=SOu(SOx(TOP$`a'w$`a'x$`a!S$`a~OQ$`aZ$`aj$`av$`a!a$`a!b$`a!d$`a!j$`a#[$`a#]$`a#^$`a#_$`a#`$`a#a$`a#b$`a#c$`a#e$`a#g$`a#i$`a#j$`a#m$`a'f$`a'p$`a!R$`a~P%?WOQ$naZ$naj$nav$na!a$na!b$na!d$na!j$na#[$na#]$na#^$na#_$na#`$na#a$na#b$na#c$na#e$na#g$na#i$na#j$na#m$na'f$na'p$na!R$na!S$na~P%%aO#m$Yq!R$Yq!S$Yq~P#*XO#m$Zq!R$Zq!S$Zq~P#*XO!S6hO~O#m6iO~P!#{O!]!wO!R&ti!c&ti~O!]!wO'p&oO!R&ti!c&ti~O!R-RO!c'}q~O!O&vi!R&vi~P!BpO!R-ZO!O(Oq~O!O6oO~P!BpO!O6oO~O!R'dy'a'dy~P!#{O!R&ya!T&ya~P!BpO!T$tq_$tq!R$tq'W$tq~P!BpOZ6vO~O!R.^O!S(Vq~O]6yO~O!T&dO%Q6zO~O!T&dO%Q6zO~P!BpO!{6{O!R&{a!S&{a~O!R2oO!S(Si~P#*XO!X7RO!Y7RO'^$dO'g(jO'o+iO~O!W7TO!x4SO~P%GXO!T.yO%Q7WO~O!T.yO%Q7WO~P!BpO]7_O'g7^O~O!R/VO!S(Tq~O!c7aO~O!c7aO~P){O!c7cO~O!c7dO~O!R#Ty!S#Ty~P#*XO_$^O!{7jO'W$^O~O_$^O!]!wO!{7jO'W$^O~O!X7mO!Y7mO'^$dO'g(jO'o+iO~O_$^O!]!wO!j7nO!{7jO'W$^O'p&oO~O#m#ky!R#ky!S#ky~P#*XOQ$giZ$gij$giv$gi!a$gi!b$gi!d$gi!j$gi#[$gi#]$gi#^$gi#_$gi#`$gi#a$gi#b$gi#c$gi#e$gi#g$gi#i$gi#j$gi#m$gi'f$gi'p$gi!R$gi!S$gi~P%%aOu(SOx(TO'x(XOP$xi'w$xi!S$xi~OQ$xiZ$xij$xiv$xi!a$xi!b$xi!d$xi!j$xi#[$xi#]$xi#^$xi#_$xi#`$xi#a$xi#b$xi#c$xi#e$xi#g$xi#i$xi#j$xi#m$xi'f$xi'p$xi!R$xi~P%LjOu(SOx(TOP$zi'w$zi'x$zi!S$zi~OQ$ziZ$zij$ziv$zi!a$zi!b$zi!d$zi!j$zi#[$zi#]$zi#^$zi#_$zi#`$zi#a$zi#b$zi#c$zi#e$zi#g$zi#i$zi#j$zi#m$zi'f$zi'p$zi!R$zi~P%NnO#m$Zy!R$Zy!S$Zy~P#*XO#m#Oy!R#Oy!S#Oy~P#*XO!]!wO!R&tq!c&tq~O!R-RO!c'}y~O!O&vq!R&vq~P!BpO!O7tO~P!BpO!R.^O!S(Vy~O!R2oO!S(Sq~O!X8QO!Y8QO'^$dO'g(jO'o+iO~O!T.yO%Q8TO~O!T.yO%Q8TO~P!BpO!c8WO~O_$^O!{8]O'W$^O~O_$^O!]!wO!{8]O'W$^O~OQ$gqZ$gqj$gqv$gq!a$gq!b$gq!d$gq!j$gq#[$gq#]$gq#^$gq#_$gq#`$gq#a$gq#b$gq#c$gq#e$gq#g$gq#i$gq#j$gq#m$gq'f$gq'p$gq!R$gq!S$gq~P%%aOQ$iqZ$iqj$iqv$iq!a$iq!b$iq!d$iq!j$iq#[$iq#]$iq#^$iq#_$iq#`$iq#a$iq#b$iq#c$iq#e$iq#g$iq#i$iq#j$iq#m$iq'f$iq'p$iq!R$iq!S$iq~P%%aO'a$|!Z!R$|!Z!{$|!Z#m$|!Z~P!#{O!R&{q!S&{q~P#*XO_$^O!{8oO'W$^O~O#W$|!ZQ$|!ZZ$|!Z_$|!Zj$|!Zv$|!Z!R$|!Z!a$|!Z!b$|!Z!d$|!Z!j$|!Z#[$|!Z#]$|!Z#^$|!Z#_$|!Z#`$|!Z#a$|!Z#b$|!Z#c$|!Z#e$|!Z#g$|!Z#i$|!Z#j$|!Z'W$|!Z'f$|!Z'p$|!Z!c$|!Z!O$|!Z!T$|!Z!{$|!Zn$|!Z%Q$|!Z!]$|!Z~P!BpOP;uOu(SOx(TO'w(VO'x(XO~O!S!za!W!za!X!za!Y!za!r!za!s!za!t!za!x!za'^!za'g!za'o!za~P&,_O!W'eX!X'eX!Y'eX!r'eX!s'eX!t'eX!x'eX'^'eX'g'eX'o'eX~P%'eOQ$|!ZZ$|!Zj$|!Zv$|!Z!a$|!Z!b$|!Z!d$|!Z!j$|!Z#[$|!Z#]$|!Z#^$|!Z#_$|!Z#`$|!Z#a$|!Z#b$|!Z#c$|!Z#e$|!Z#g$|!Z#i$|!Z#j$|!Z#m$|!Z'f$|!Z'p$|!Z!R$|!Z!S$|!Z~P%%aO!Wra!Xra!Yra!rra!sra!tra!xra'^ra'gra'ora~P%;OO!W$^a!X$^a!Y$^a!r$^a!s$^a!t$^a!x$^a'^$^a'g$^a'o$^a~P%=SO!W$`a!X$`a!Y$`a!r$`a!s$`a!t$`a!x$`a'^$`a'g$`a'o$`a~P%?WO!S$na!W$na!X$na!Y$na!r$na!s$na!t$na!x$na'^$na'g$na'o$na~P&,_O!W$xi!X$xi!Y$xi!r$xi!s$xi!t$xi!x$xi'^$xi'g$xi'o$xi~P%LjO!W$zi!X$zi!Y$zi!r$zi!s$zi!t$zi!x$zi'^$zi'g$zi'o$zi~P%NnO!S$gi!W$gi!X$gi!Y$gi!r$gi!s$gi!t$gi!x$gi'^$gi'g$gi'o$gi~P&,_O!S$gq!W$gq!X$gq!Y$gq!r$gq!s$gq!t$gq!x$gq'^$gq'g$gq'o$gq~P&,_O!S$iq!W$iq!X$iq!Y$iq!r$iq!s$iq!t$iq!x$iq'^$iq'g$iq'o$iq~P&,_O!S$|!Z!W$|!Z!X$|!Z!Y$|!Z!r$|!Z!s$|!Z!t$|!Z!x$|!Z'^$|!Z'g$|!Z'o$|!Z~P&,_On'hX~P.jOn[X!O[X!c[X%r[X!T[X%Q[X!][X~P$zO!]dX!c[X!cdX'pdX~P;dOQ9^OR9^O]cOb;`Oc!jOhcOj9^OkcOlcOq9^Os9^OxRO{cO|cO}cO!TSO!_9`O!dUO!g9^O!h9^O!i9^O!j9^O!k9^O!n!iO#t!lO#x^O']'cO'fQO'oYO'|;^O~O]#qOh$QOj#rOk#qOl#qOq$ROs9uOx#yO!T#zO!_;fO!d#vO#V:OO#t$VO$_9xO$a9{O$d$WO']&{O'b$PO'f#sO~O!R9pO!S$]a~O]#qOh$QOj#rOk#qOl#qOq$ROs9vOx#yO!T#zO!_;gO!d#vO#V:PO#t$VO$_9yO$a9|O$d$WO']&{O'b$PO'f#sO~O#d'jO~P&<WO!S[X!SdX~P;dO!]9dO~O#W9cO~O!]!wO#W9cO~O!{9sO~O#c9iO~O!{:QO!R'uX!S'uX~O!{9sO!R'sX!S'sX~O#W:RO~O'a:TO~P!#{O#W:[O~O#W:]O~O#W:^O~O!]!wO#W:_O~O!]!wO#W:RO~O#m:`O~P#*XO#W:aO~O#W:bO~O#W:cO~O#W:dO~O#W:eO~O#W:fO~O#W:gO~O#W:hO~O!O:iO~O#m:jO~P!#{O#m:kO~P!#{O#m:lO~P!#{O!O:mO~P!BpO!O:mO~O!O:nO~P!BpO!]!wO#c;lO~O!]!wO#c;nO~O#x~!b!r!t!u#U#V'|$_$a$d$u%P%Q%R%X%Z%^%_%a%c~UT#x'|#]}'Y'Z#z'Y']'g~",
    goto: "#Kk(ZPPPPPPPP([P(lP*`PPPP-zPP.a3s7o8SP8SPPP8SP:U8SP8SP:YPP:`P:t?VPPPP?ZPPPP?ZA{PPPBRDdP?ZPFwPPPPHp?ZPPPPPJi?ZPPMjNgPPPPNk!!TP!!]!#^PNg?Z?Z!&n!)i!.[!.[!1kPPP!1r!4h?ZPPPPPPPPPP!7_P!8pPP?Z!9}P?ZP?Z?Z?Z?ZP?Z!;dPP!>]P!AQ!AY!A^!A^P!>YP!Ab!AbP!DVP!DZ?Z?Z!Da!GT8SP8SP8S8SP!HW8S8S!Jf8S!M_8S# g8S8S#!T#$c#$c#$g#$c#$oP#$cP8S#%k8S#'X8S8S-zPPP#(yPP#)c#)cP#)cP#)x#)cPP#*OP#)uP#)u#*b!!X#)u#+P#+V#+Y([#+]([P#+d#+d#+dP([P([P([P([PP([P#+j#+mP#+m([P#+qP#+tP([P([P([P([P([P([([#+z#,U#,[#,b#,p#,v#,|#-W#-^#-m#-s#.R#.X#._#.m#/S#0z#1Y#1`#1f#1l#1r#1|#2S#2Y#2d#2v#2|PPPPPPPP#3SPP#3v#7OPP#8f#8m#8uPP#>a#@t#Fp#Fs#Fv#GR#GUPP#GX#G]#Gz#Hq#Hu#IZPP#I_#Ie#IiP#Il#Ip#Is#Jc#Jy#KO#KR#KU#K[#K_#Kc#KgmhOSj}!n$]%c%f%g%i*o*t/g/jQ$imQ$ppQ%ZyS&V!b+`Q&k!jS(l#z(qQ)g$jQ)t$rQ*`%TQ+f&^S+k&d+mQ+}&lQ-k(sQ/U*aY0Z+o+p+q+r+sS2t.y2vU3|0[0^0aU5g2y2z2{S6]4O4RS7R5h5iQ7m6_R8Q7T$p[ORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8o!j'e#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aQ(}$SQ)l$lQ*b%WQ*i%`Q,X9tQ.W)aQ.c)mQ/^*gQ2_.^Q3Z/VQ4^9vQ5S2`R8{9upeOSjy}!n$]%Y%c%f%g%i*o*t/g/jR*d%[&WVOSTjkn}!S!W!k!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k$]$n%[%_%`%c%e%f%g%i%m%z&S&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;`;a[!cRU!]!`%x&WQ$clQ$hmS$mp$rv$wrs!r!u$Z$u&`&t&w)x)y)z*m+Y+h,S,U/o0lQ%PwQ&h!iQ&j!jS(_#v(cS)f$i$jQ)j$lQ)w$tQ*Z%RQ*_%TS+|&k&lQ-V(`Q.[)gQ.b)mQ.d)nQ.g)rQ/P*[S/T*`*aQ0h+}Q1b-RQ2^.^Q2b.aQ2g.iQ3Y/UQ4i1cQ5R2`Q5U2dQ6u5QR7w6vx#xa!y$T$U$Y(W(Y(b(w(x,_-Y-w1a1y6i;^;i;j;k!Y$fm!j$h$i$j&U&j&k&l(k)f)g+]+j+|+}-d.[0Q0W0]0h1u3{4Q6Z7k8^Q)`$cQ*P$|Q*S$}Q*^%TQ.k)wQ/O*ZU/S*_*`*aQ3T/PS3X/T/UQ5b2sQ5t3YS7P5c5fS8O7Q7SQ8f8PQ8u8g#[;b!w#d#v#y&g'}(Z(h)])_)a*O*R+y-Z-].R.T.p.s.{.}1k1s2Q2T2X2j3Q3S4l4u4}5k5p6z7W8T9w9z9}:U:X:[:a:d:j;l;n;t;u;vd;c9d9x9{:O:V:Y:]:b:e:ke;d9r9y9|:P:W:Z:^:c:f:lW#}a$P(y;^S$|t%YQ$}uQ%OvR)}$z%P#|a!w!y#d#v#y$T$U$Y&g'}(W(Y(Z(b(h(w(x)])_)a*O*R+y,_-Y-Z-]-w.R.T.p.s.{.}1a1k1s1y2Q2T2X2j3Q3S4l4u4}5k5p6i6z7W8T9d9r9w9x9y9z9{9|9}:O:P:U:V:W:X:Y:Z:[:]:^:a:b:c:d:e:f:j:k:l;^;i;j;k;l;n;t;u;vT(O#s(PX)O$S9t9u9vU&Z!b$v+cQ'U!{Q)q$oQ.t*TQ1z-tR5^2o&^cORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;a$]#aZ!_!o$a%w%}&y'Q'W'X'Y'Z'[']'^'_'`'a'b'd'g'k'u)p+R+^+g,O,^,d,g,i,w-x/v/y0i0s0w0x0y0z0{0|0}1O1P1Q1R1S1T1W1]2O2[3s3v4W4[4]4b4c5`6S6V6b6f6g7g7z8Z8m8y9_:|T!XQ!Y&_cORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aQ&X!bR/|+`Y&R!b&V&^+`+fS(k#z(qS+j&d+mS-d(l(sQ-e(mQ-l(tQ.v*VU0W+k+o+pU0]+q+r+sS0b+t2xQ1u-kQ1w-mQ1x-nS2s.y2vU3{0Z0[0^Q4P0_Q4Q0aS5c2t2{S5f2y2zU6Z3|4O4RQ6`4SS7Q5g5hQ7S5iS7k6]6_S8P7R7TQ8^7mQ8g8QQ;h;oR;m;slhOSj}!n$]%c%f%g%i*o*t/g/jQ%k!QS&x!v9cQ)d$gQ*X%PQ*Y%QQ+z&iS,]&}:RS-y)V:_Q.Y)eQ.x*WQ/n*vQ/p*wQ/x+ZQ0`+qQ0f+{S2P-z:gQ2Y.ZS2].]:hQ3r/zQ3u0RQ4U0gQ5P2ZQ6T3tQ6X3zQ6a4VQ7e6RQ7h6YQ8Y7iQ8l8[R8x8n$W#`Z!_!o%w%}&y'Q'W'X'Y'Z'[']'^'_'`'a'b'd'g'k'u)p+R+^+g,O,^,d,g,w-x/v/y0i0s0w0x0y0z0{0|0}1O1P1Q1R1S1T1W1]2O2[3s3v4W4[4]4b4c5`6S6V6b6f6g7g7z8Z8m8y9_:|W(v#{&|1V8qT)Z$a,i$W#_Z!_!o%w%}&y'Q'W'X'Y'Z'[']'^'_'`'a'b'd'g'k'u)p+R+^+g,O,^,d,g,w-x/v/y0i0s0w0x0y0z0{0|0}1O1P1Q1R1S1T1W1]2O2[3s3v4W4[4]4b4c5`6S6V6b6f6g7g7z8Z8m8y9_:|Q'f#`S)Y$a,iR-{)Z&^cORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aQ%f{Q%g|Q%i!OQ%j!PR/f*rQ&e!iQ)[$cQ+w&hS.Q)`)wS0c+u+vW2S-}.O.P.kS4T0d0eU4|2U2V2WU6s4{5Y5ZQ7v6tR8b7yT+l&d+mS+j&d+mU0W+k+o+pU0]+q+r+sS0b+t2xS2s.y2vU3{0Z0[0^Q4P0_Q4Q0aS5c2t2{S5f2y2zU6Z3|4O4RQ6`4SS7Q5g5hQ7S5iS7k6]6_S8P7R7TQ8^7mR8g8QS+l&d+mT2u.y2vS&r!q/dQ-U(_Q-b(kS0V+j2sQ1g-VS1p-c-lU3}0]0b5fQ4h1bS4s1v1xU6^4P4Q7SQ6k4iQ6r4vR7n6`Q!xXS&q!q/dQ)W$[Q)b$eQ)h$kQ,Q&rQ-T(_Q-a(kQ-f(nQ.X)cQ/Q*]S0U+j2sS1f-U-VS1o-b-lQ1r-eQ1t-gQ3V/RW3y0V0]0b5fQ4g1bQ4k1gS4o1p1xQ4t1wQ5r3WW6[3}4P4Q7SS6j4h4iS6n4p:iQ6p4sQ6}5aQ7[5sS7l6^6`Q7r6kS7s6o:mQ7u6rQ7|7OQ8V7]Q8_7nS8a7t:nQ8d7}Q8s8eQ9Q8tQ9X9RQ:u:pQ;T:zQ;U:{Q;V;hR;[;m$rWORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%`%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8oS!xn!k!j:o#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aR:u;`$rXORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%`%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8oQ$[b!Y$em!j$h$i$j&U&j&k&l(k)f)g+]+j+|+}-d.[0Q0W0]0h1u3{4Q6Z7k8^S$kn!kQ)c$fQ*]%TW/R*^*_*`*aU3W/S/T/UQ5a2sS5s3X3YU7O5b5c5fQ7]5tU7}7P7Q7SS8e8O8PS8t8f8gQ9R8u!j:p#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aQ:z;_R:{;`$f]OSTjk}!S!W!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%c%e%f%g%i%m%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8oY!hRU!]!`%xv$wrs!r!u$Z$u&`&t&w)x)y)z*m+Y+h,S,U/o0lQ*j%`!h:q#]#k'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aR:t&WS&[!b$vR0O+c$p[ORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8o!j'e#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aR*i%`$roORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%`%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8oQ'U!{!k:r#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;a!h#VZ!_$a%w%}&y'Q'_'`'a'b'g'k)p+R+g,O,^,d,w-x0i0s1T2O2[3v4W4[6V7g8Z8m8y9_!R9k'd'u+^,i/v/y0w1P1Q1R1S1W1]3s4]4b4c5`6S6b6f6g7z:|!d#XZ!_$a%w%}&y'Q'a'b'g'k)p+R+g,O,^,d,w-x0i0s1T2O2[3v4W4[6V7g8Z8m8y9_}9m'd'u+^,i/v/y0w1R1S1W1]3s4]4b4c5`6S6b6f6g7z:|!`#]Z!_$a%w%}&y'Q'g'k)p+R+g,O,^,d,w-x0i0s1T2O2[3v4W4[6V7g8Z8m8y9_Q1a-Px;a'd'u+^,i/v/y0w1W1]3s4]4b4c5`6S6b6f6g7z:|Q;i;pQ;j;qR;k;r&^cORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aS#l`#mR1Y,l&e_ORSTU`jk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k#m$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,l,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aS#g^#nT'n#i'rT#h^#nT'p#i'r&e`ORSTU`jk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#]#b#e#k#m$]$n%[%_%`%c%e%f%g%i%m%x%z&S&W&_&f&p&}'R'w(R)V)^*k*o*t+T+X+[+x,P,b,h,l,m-u-z.S.].|/_/`/a/c/g/j/l/{0T0j0t1X2i2q3R3f3h3i3q3x5o5}6W6{7j8]8o9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;aT#l`#mQ#o`R'y#m$rbORSTUjk}!S!W!]!`!n!v!z!|#P#Q#R#S#T#U#V#W#X#Y#Z#b#e$]$n%[%_%`%c%e%f%g%i%m%x%z&S&_&f&p&}'R(R)V)^*k*o*t+T+x,P,b,h-u-z.S.].|/_/`/a/c/g/j/l0T0j0t2i3R3f3h3i3x5o5}6W7j8]8o!k;_#]#k&W'w+X+[,m/{1X2q3q6{9^9`9c9e9f9g9h9i9j9k9l9m9n9o9p9s:Q:R:T:_:`:g:h;a#RdOSUj}!S!W!n!|#k$]%[%_%`%c%e%f%g%i%m&S&f'w)^*k*o*t+x,m-u.S.|/_/`/a/c/g/j/l1X2i3R3f3h3i5o5}x#{a!y$T$U$Y(W(Y(b(w(x,_-Y-w1a1y6i;^;i;j;k#[&|!w#d#v#y&g'}(Z(h)])_)a*O*R+y-Z-].R.T.p.s.{.}1k1s2Q2T2X2j3Q3S4l4u4}5k5p6z7W8T9w9z9}:U:X:[:a:d:j;l;n;t;u;vQ)S$WQ,x(Sd1V9r9y9|:P:W:Z:^:c:f:le8q9d9x9{:O:V:Y:]:b:e:kx#wa!y$T$U$Y(W(Y(b(w(x,_-Y-w1a1y6i;^;i;j;kQ(d#xS(n#z(qQ)T$XQ-g(o#[:w!w#d#v#y&g'}(Z(h)])_)a*O*R+y-Z-].R.T.p.s.{.}1k1s2Q2T2X2j3Q3S4l4u4}5k5p6z7W8T9w9z9}:U:X:[:a:d:j;l;n;t;u;vd:x9d9x9{:O:V:Y:]:b:e:kd:y9r9y9|:P:W:Z:^:c:f:lQ:};bQ;O;cQ;P;dQ;Q;eQ;R;fR;S;gx#{a!y$T$U$Y(W(Y(b(w(x,_-Y-w1a1y6i;^;i;j;k#[&|!w#d#v#y&g'}(Z(h)])_)a*O*R+y-Z-].R.T.p.s.{.}1k1s2Q2T2X2j3Q3S4l4u4}5k5p6z7W8T9w9z9}:U:X:[:a:d:j;l;n;t;u;vd1V9r9y9|:P:W:Z:^:c:f:le8q9d9x9{:O:V:Y:]:b:e:klfOSj}!n$]%c%f%g%i*o*t/g/jQ(g#yQ*}%pQ+O%rR1j-Z%O#|a!w!y#d#v#y$T$U$Y&g'}(W(Y(Z(b(h(w(x)])_)a*O*R+y,_-Y-Z-]-w.R.T.p.s.{.}1a1k1s1y2Q2T2X2j3Q3S4l4u4}5k5p6i6z7W8T9d9r9w9x9y9z9{9|9}:O:P:U:V:W:X:Y:Z:[:]:^:a:b:c:d:e:f:j:k:l;^;i;j;k;l;n;t;u;vQ*Q$}Q.r*SQ2m.qR5]2nT(p#z(qS(p#z(qT2u.y2vQ)b$eQ-f(nQ.X)cQ/Q*]Q3V/RQ5r3WQ6}5aQ7[5sQ7|7OQ8V7]Q8d7}Q8s8eQ9Q8tR9X9Rp(W#t'O)U-X-o-p0q1h1}4f4w7q:v;W;X;Y!n:U&z'i(^(f+v,[,t-P-^-|.P.o.q0e0p1i1m2W2l2n3O4Y4Z4m4q4y5O5Z5n6m6q7Y8`;Z;];p;q;r[:V8p9O9V9Y9Z9]]:W1U4a6c7o7p8zr(Y#t'O)U,}-X-o-p0q1h1}4f4w7q:v;W;X;Y!p:X&z'i(^(f+v,[,t-P-^-|.P.o.q0e0n0p1i1m2W2l2n3O4Y4Z4m4q4y5O5Z5n6m6q7Y8`;Z;];p;q;r^:Y8p9O9T9V9Y9Z9]_:Z1U4a6c6d7o7p8zpeOSjy}!n$]%Y%c%f%g%i*o*t/g/jQ%VxR*k%`peOSjy}!n$]%Y%c%f%g%i*o*t/g/jR%VxQ*U%OR.n)}qeOSjy}!n$]%Y%c%f%g%i*o*t/g/jQ.z*ZS3P/O/PW5j2|2}3O3TU7V5l5m5nU8R7U7X7YQ8h8SR8v8iQ%^yR*e%YR3^/XR7_5uS$mp$rR.d)nQ%czR*o%dR*u%jT/h*t/jR*y%kQ*x%kR/q*yQjOQ!nST$`j!nQ(P#sR,u(PQ!YQR%u!YQ!^RU%{!^%|+UQ%|!_R+U%}Q+a&XR/}+aQ,`'OR0r,`Q,c'QS0u,c0vR0v,dQ+m&dR0X+mS!eR$uU&a!e&b+VQ&b!fR+V&OQ+d&[R0P+dQ&u!sQ,R&sU,V&u,R0mR0m,WQ'r#iR,n'rQ#m`R'x#mQ#cZU'h#c+Q9qQ+Q9_R9q'uQ-S(_W1d-S1e4j6lU1e-T-U-VS4j1f1gR6l4k$k(U#t&z'O'i(^(f)P)Q)U+v,Y,Z,[,t,}-O-P-X-^-o-p-|.P.o.q0e0n0o0p0q1U1h1i1m1}2W2l2n3O4Y4Z4_4`4a4f4m4q4w4y5O5Z5n6c6d6e6m6q7Y7o7p7q8`8p8z8|8}9O9T9U9V9Y9Z9]:v;W;X;Y;Z;];p;q;rQ-[(fU1l-[1n4nQ1n-^R4n1mQ(q#zR-i(qQ(z$OR-r(zQ2R-|R4z2RQ){$xR.m){Q2p.tS5_2p6|R6|5`Q*W%PR.w*WQ2v.yR5d2vQ/W*bS3[/W5vR5v3^Q._)jW2a._2c5T6wQ2c.bQ5T2bR6w5UQ)o$mR.e)oQ/j*tR3l/jWiOSj!nQ%h}Q)X$]Q*n%cQ*p%fQ*q%gQ*s%iQ/e*oS/h*t/jR3k/gQ$_gQ%l!RQ%o!TQ%q!UQ%s!VQ)v$sQ)|$yQ*d%^Q*{%nQ-h(pS/Z*e*hQ/r*zQ/s*}Q/t+OS0S+j2sQ2f.hQ2k.oQ3U/QQ3`/]Q3j/fY3w0U0V0]0b5fQ5X2hQ5[2lQ5q3VQ5w3_[6U3v3y3}4P4Q7SQ6x5VQ7Z5rQ7`5xW7f6V6[6^6`Q7x6yQ7{6}Q8U7[U8X7g7l7nQ8c7|Q8j8VS8k8Z8_Q8r8dQ8w8mQ9P8sQ9S8yQ9W9QR9[9XQ$gmQ&i!jU)e$h$i$jQ+Z&UU+{&j&k&lQ-`(kS.Z)f)gQ/z+]Q0R+jS0g+|+}Q1q-dQ2Z.[Q3t0QS3z0W0]Q4V0hQ4r1uS6Y3{4QQ7i6ZQ8[7kR8n8^S#ua;^R({$PU$Oa$P;^R-q(yQ#taS&z!w)aQ'O!yQ'i#dQ(^#vQ(f#yQ)P$TQ)Q$UQ)U$YQ+v&gQ,Y9wQ,Z9zQ,[9}Q,t'}Q,}(WQ-O(YQ-P(ZQ-X(bQ-^(hQ-o(wQ-p(xd-|)].R.{2T3Q4}5k6z7W8TQ.P)_Q.o*OQ.q*RQ0e+yQ0n:UQ0o:XQ0p:[Q0q,_Q1U9rQ1h-YQ1i-ZQ1m-]Q1}-wQ2W.TQ2l.pQ2n.sQ3O.}Q4Y:aQ4Z:dQ4_9yQ4`9|Q4a:PQ4f1aQ4m1kQ4q1sQ4w1yQ4y2QQ5O2XQ5Z2jQ5n3SQ6c:^Q6d:WQ6e:ZQ6m4lQ6q4uQ7Y5pQ7o:cQ7p:fQ7q6iQ8`:jQ8p9dQ8z:lQ8|9xQ8}9{Q9O:OQ9T:VQ9U:YQ9V:]Q9Y:bQ9Z:eQ9]:kQ:v;^Q;W;iQ;X;jQ;Y;kQ;Z;lQ;];nQ;p;tQ;q;uR;r;vlgOSj}!n$]%c%f%g%i*o*t/g/jS!pU%eQ%n!SQ%t!WQ'V!|Q'v#kS*h%[%_Q*l%`Q*z%mQ+W&SQ+u&fQ,r'wQ.O)^Q/b*kQ0d+xQ1[,mQ1{-uQ2V.SQ2}.|Q3b/_Q3c/`Q3e/aQ3g/cQ3n/lQ4d1XQ5Y2iQ5m3RQ5|3fQ6O3hQ6P3iQ7X5oR7b5}!vZOSUj}!S!n!|$]%[%_%`%c%e%f%g%i%m&S&f)^*k*o*t+x-u.S.|/_/`/a/c/g/j/l2i3R3f3h3i5o5}Q!_RQ!oTQ$akS%w!]%zQ%}!`Q&y!vQ'Q!zQ'W#PQ'X#QQ'Y#RQ'Z#SQ'[#TQ']#UQ'^#VQ'_#WQ'`#XQ'a#YQ'b#ZQ'd#]Q'g#bQ'k#eW'u#k'w,m1XQ)p$nS+R%x+TS+^&W/{Q+g&_Q,O&pQ,^&}Q,d'RQ,g9^Q,i9`Q,w(RQ-x)VQ/v+XQ/y+[Q0i,PQ0s,bQ0w9cQ0x9eQ0y9fQ0z9gQ0{9hQ0|9iQ0}9jQ1O9kQ1P9lQ1Q9mQ1R9nQ1S9oQ1T,hQ1W9sQ1]9pQ2O-zQ2[.]Q3s:QQ3v0TQ4W0jQ4[0tQ4]:RQ4b:TQ4c:_Q5`2qQ6S3qQ6V3xQ6b:`Q6f:gQ6g:hQ7g6WQ7z6{Q8Z7jQ8m8]Q8y8oQ9_!WR:|;aR!aRR&Y!bS&U!b+`S+]&V&^R0Q+fR'P!yR'S!zT!tU$ZS!sU$ZU$xrs*mS&s!r!uQ,T&tQ,W&wQ.l)zS0k,S,UR4X0l`!dR!]!`$u%x&`)x+hh!qUrs!r!u$Z&t&w)z,S,U0lQ/d*mQ/w+YQ3p/oT:s&W)yT!gR$uS!fR$uS%y!]&`S&O!`)xS+S%x+hT+_&W)yT&]!b$vQ#i^R'{#nT'q#i'rR1Z,lT(a#v(cR(i#yQ-})]Q2U.RQ2|.{Q4{2TQ5l3QQ6t4}Q7U5kQ7y6zQ8S7WR8i8TlhOSj}!n$]%c%f%g%i*o*t/g/jQ%]yR*d%YV$yrs*mR.u*TR*c%WQ$qpR)u$rR)k$lT%az%dT%bz%dT/i*t/j",
    nodeNames: "\u26A0 extends ArithOp ArithOp InterpolationStart LineComment BlockComment Script ExportDeclaration export Star as VariableName String from ; default FunctionDeclaration async function VariableDefinition TypeParamList TypeDefinition ThisType this LiteralType ArithOp Number BooleanLiteral TemplateType InterpolationEnd Interpolation VoidType void TypeofType typeof MemberExpression . ?. PropertyName [ TemplateString Interpolation null super RegExp ] ArrayExpression Spread , } { ObjectExpression Property async get set PropertyDefinition Block : NewExpression new TypeArgList CompareOp < ) ( ArgList UnaryExpression await yield delete LogicOp BitOp ParenthesizedExpression ClassExpression class extends ClassBody MethodDeclaration Privacy static abstract override PrivatePropertyDefinition PropertyDeclaration readonly Optional TypeAnnotation Equals StaticBlock FunctionExpression ArrowFunction ParamList ParamList ArrayPattern ObjectPattern PatternProperty Privacy readonly Arrow MemberExpression PrivatePropertyName BinaryExpression ArithOp ArithOp ArithOp ArithOp BitOp CompareOp instanceof in const CompareOp BitOp BitOp BitOp LogicOp LogicOp ConditionalExpression LogicOp LogicOp AssignmentExpression UpdateOp PostfixExpression CallExpression TaggedTemplateExpression DynamicImport import ImportMeta JSXElement JSXSelfCloseEndTag JSXStartTag JSXSelfClosingTag JSXIdentifier JSXNamespacedName JSXMemberExpression JSXSpreadAttribute JSXAttribute JSXAttributeValue JSXEscape JSXEndTag JSXOpenTag JSXFragmentTag JSXText JSXEscape JSXStartCloseTag JSXCloseTag PrefixCast ArrowFunction TypeParamList SequenceExpression KeyofType keyof UniqueType unique ImportType InferredType infer TypeName ParenthesizedType FunctionSignature ParamList NewSignature IndexedType TupleType Label ArrayType ReadonlyType ObjectType MethodType PropertyType IndexSignature CallSignature TypePredicate is NewSignature new UnionType LogicOp IntersectionType LogicOp ConditionalType ParameterizedType ClassDeclaration abstract implements type VariableDeclaration let var TypeAliasDeclaration InterfaceDeclaration interface EnumDeclaration enum EnumBody NamespaceDeclaration namespace module AmbientDeclaration declare GlobalDeclaration global ClassDeclaration ClassBody MethodDeclaration AmbientFunctionDeclaration ExportGroup VariableName VariableName ImportDeclaration ImportGroup ForStatement for ForSpec ForInSpec ForOfSpec of WhileStatement while WithStatement with DoStatement do IfStatement if else SwitchStatement switch SwitchBody CaseLabel case DefaultLabel TryStatement try CatchClause catch FinallyClause finally ReturnStatement return ThrowStatement throw BreakStatement break ContinueStatement continue DebuggerStatement debugger LabeledStatement ExpressionStatement",
    maxTerm: 332,
    context: trackNewline,
    nodeProps: [
      ["closedBy", 4, "InterpolationEnd", 40, "]", 51, "}", 66, ")", 132, "JSXSelfCloseEndTag JSXEndTag", 146, "JSXEndTag"],
      ["group", -26, 8, 15, 17, 58, 184, 188, 191, 192, 194, 197, 200, 211, 213, 219, 221, 223, 225, 228, 234, 240, 242, 244, 246, 248, 250, 251, "Statement", -30, 12, 13, 24, 27, 28, 41, 43, 44, 45, 47, 52, 60, 68, 74, 75, 91, 92, 101, 103, 119, 122, 124, 125, 126, 127, 129, 130, 148, 149, 151, "Expression", -22, 23, 25, 29, 32, 34, 152, 154, 156, 157, 159, 160, 161, 163, 164, 165, 167, 168, 169, 178, 180, 182, 183, "Type", -3, 79, 85, 90, "ClassItem"],
      ["openedBy", 30, "InterpolationStart", 46, "[", 50, "{", 65, "(", 131, "JSXStartTag", 141, "JSXStartTag JSXStartCloseTag"]
    ],
    propSources: [jsHighlight],
    skippedNodes: [0, 5, 6],
    repeatNodeCount: 28,
    tokenData: "!C}~R!`OX%TXY%cYZ'RZ[%c[]%T]^'R^p%Tpq%cqr'crs(kst0htu2`uv4pvw5ewx6cxy<yyz=Zz{=k{|>k|}?O}!O>k!O!P?`!P!QCl!Q!R!0[!R![!1q![!]!7s!]!^!8V!^!_!8g!_!`!9d!`!a!:[!a!b!<R!b!c%T!c!}2`!}#O!=d#O#P%T#P#Q!=t#Q#R!>U#R#S2`#S#T!>i#T#o2`#o#p!>y#p#q!?O#q#r!?f#r#s!?x#s$f%T$f$g%c$g#BY2`#BY#BZ!@Y#BZ$IS2`$IS$I_!@Y$I_$I|2`$I|$I}!Bq$I}$JO!Bq$JO$JT2`$JT$JU!@Y$JU$KV2`$KV$KW!@Y$KW&FU2`&FU&FV!@Y&FV?HT2`?HT?HU!@Y?HU~2`W%YR$UWO!^%T!_#o%T#p~%T7Z%jg$UW'Y7ROX%TXY%cYZ%TZ[%c[p%Tpq%cq!^%T!_#o%T#p$f%T$f$g%c$g#BY%T#BY#BZ%c#BZ$IS%T$IS$I_%c$I_$JT%T$JT$JU%c$JU$KV%T$KV$KW%c$KW&FU%T&FU&FV%c&FV?HT%T?HT?HU%c?HU~%T7Z'YR$UW'Z7RO!^%T!_#o%T#p~%T$T'jS$UW!j#{O!^%T!_!`'v!`#o%T#p~%T$O'}S#e#v$UWO!^%T!_!`(Z!`#o%T#p~%T$O(bR#e#v$UWO!^%T!_#o%T#p~%T)X(rZ$UW]#eOY(kYZ)eZr(krs*rs!^(k!^!_+U!_#O(k#O#P-b#P#o(k#o#p+U#p~(k&r)jV$UWOr)ers*Ps!^)e!^!_*a!_#o)e#o#p*a#p~)e&r*WR$P&j$UWO!^%T!_#o%T#p~%T&j*dROr*ars*ms~*a&j*rO$P&j)X*{R$P&j$UW]#eO!^%T!_#o%T#p~%T)P+ZV]#eOY+UYZ*aZr+Urs+ps#O+U#O#P+w#P~+U)P+wO$P&j]#e)P+zROr+Urs,Ts~+U)P,[U$P&j]#eOY,nZr,nrs-Vs#O,n#O#P-[#P~,n#e,sU]#eOY,nZr,nrs-Vs#O,n#O#P-[#P~,n#e-[O]#e#e-_PO~,n)X-gV$UWOr(krs-|s!^(k!^!_+U!_#o(k#o#p+U#p~(k)X.VZ$P&j$UW]#eOY.xYZ%TZr.xrs/rs!^.x!^!_,n!_#O.x#O#P0S#P#o.x#o#p,n#p~.x#m/PZ$UW]#eOY.xYZ%TZr.xrs/rs!^.x!^!_,n!_#O.x#O#P0S#P#o.x#o#p,n#p~.x#m/yR$UW]#eO!^%T!_#o%T#p~%T#m0XT$UWO!^.x!^!_,n!_#o.x#o#p,n#p~.x3]0mZ$UWOt%Ttu1`u!^%T!_!c%T!c!}1`!}#R%T#R#S1`#S#T%T#T#o1`#p$g%T$g~1`3]1g]$UW'o3TOt%Ttu1`u!Q%T!Q![1`![!^%T!_!c%T!c!}1`!}#R%T#R#S1`#S#T%T#T#o1`#p$g%T$g~1`7Z2k_$UW#zS']$y'g3SOt%Ttu2`u}%T}!O3j!O!Q%T!Q![2`![!^%T!_!c%T!c!}2`!}#R%T#R#S2`#S#T%T#T#o2`#p$g%T$g~2`[3q_$UW#zSOt%Ttu3ju}%T}!O3j!O!Q%T!Q![3j![!^%T!_!c%T!c!}3j!}#R%T#R#S3j#S#T%T#T#o3j#p$g%T$g~3j$O4wS#^#v$UWO!^%T!_!`5T!`#o%T#p~%T$O5[R$UW#o#vO!^%T!_#o%T#p~%T5b5lU'x5Y$UWOv%Tvw6Ow!^%T!_!`5T!`#o%T#p~%T$O6VS$UW#i#vO!^%T!_!`5T!`#o%T#p~%T)X6jZ$UW]#eOY6cYZ7]Zw6cwx*rx!^6c!^!_8T!_#O6c#O#P:T#P#o6c#o#p8T#p~6c&r7bV$UWOw7]wx*Px!^7]!^!_7w!_#o7]#o#p7w#p~7]&j7zROw7wwx*mx~7w)P8YV]#eOY8TYZ7wZw8Twx+px#O8T#O#P8o#P~8T)P8rROw8Twx8{x~8T)P9SU$P&j]#eOY9fZw9fwx-Vx#O9f#O#P9}#P~9f#e9kU]#eOY9fZw9fwx-Vx#O9f#O#P9}#P~9f#e:QPO~9f)X:YV$UWOw6cwx:ox!^6c!^!_8T!_#o6c#o#p8T#p~6c)X:xZ$P&j$UW]#eOY;kYZ%TZw;kwx/rx!^;k!^!_9f!_#O;k#O#P<e#P#o;k#o#p9f#p~;k#m;rZ$UW]#eOY;kYZ%TZw;kwx/rx!^;k!^!_9f!_#O;k#O#P<e#P#o;k#o#p9f#p~;k#m<jT$UWO!^;k!^!_9f!_#o;k#o#p9f#p~;k&i=QR!d&a$UWO!^%T!_#o%T#p~%Tk=bR!cc$UWO!^%T!_#o%T#p~%T7V=tU'^4V#_#v$UWOz%Tz{>W{!^%T!_!`5T!`#o%T#p~%T$O>_S#[#v$UWO!^%T!_!`5T!`#o%T#p~%T%w>rSj%o$UWO!^%T!_!`5T!`#o%T#p~%T&i?VR!R&a$UWO!^%T!_#o%T#p~%T7Z?gVu5^$UWO!O%T!O!P?|!P!Q%T!Q![@r![!^%T!_#o%T#p~%T!{@RT$UWO!O%T!O!P@b!P!^%T!_#o%T#p~%T!{@iR!Q!s$UWO!^%T!_#o%T#p~%T!{@yZ$UWk!sO!Q%T!Q![@r![!^%T!_!g%T!g!hAl!h#R%T#R#S@r#S#X%T#X#YAl#Y#o%T#p~%T!{AqZ$UWO{%T{|Bd|}%T}!OBd!O!Q%T!Q![CO![!^%T!_#R%T#R#SCO#S#o%T#p~%T!{BiV$UWO!Q%T!Q![CO![!^%T!_#R%T#R#SCO#S#o%T#p~%T!{CVV$UWk!sO!Q%T!Q![CO![!^%T!_#R%T#R#SCO#S#o%T#p~%T7ZCs`$UW#]#vOYDuYZ%TZzDuz{Jl{!PDu!P!Q!-e!Q!^Du!^!_Fx!_!`!.^!`!a!/]!a!}Du!}#OHq#O#PJQ#P#oDu#o#pFx#p~DuXD|[$UW}POYDuYZ%TZ!PDu!P!QEr!Q!^Du!^!_Fx!_!}Du!}#OHq#O#PJQ#P#oDu#o#pFx#p~DuXEy_$UW}PO!^%T!_#Z%T#Z#[Er#[#]%T#]#^Er#^#a%T#a#bEr#b#g%T#g#hEr#h#i%T#i#jEr#j#m%T#m#nEr#n#o%T#p~%TPF}V}POYFxZ!PFx!P!QGd!Q!}Fx!}#OG{#O#PHh#P~FxPGiU}P#Z#[Gd#]#^Gd#a#bGd#g#hGd#i#jGd#m#nGdPHOTOYG{Z#OG{#O#PH_#P#QFx#Q~G{PHbQOYG{Z~G{PHkQOYFxZ~FxXHvY$UWOYHqYZ%TZ!^Hq!^!_G{!_#OHq#O#PIf#P#QDu#Q#oHq#o#pG{#p~HqXIkV$UWOYHqYZ%TZ!^Hq!^!_G{!_#oHq#o#pG{#p~HqXJVV$UWOYDuYZ%TZ!^Du!^!_Fx!_#oDu#o#pFx#p~Du7ZJs^$UW}POYJlYZKoZzJlz{NQ{!PJl!P!Q!,R!Q!^Jl!^!_!!]!_!}Jl!}#O!'|#O#P!+a#P#oJl#o#p!!]#p~Jl7ZKtV$UWOzKoz{LZ{!^Ko!^!_M]!_#oKo#o#pM]#p~Ko7ZL`X$UWOzKoz{LZ{!PKo!P!QL{!Q!^Ko!^!_M]!_#oKo#o#pM]#p~Ko7ZMSR$UWU7RO!^%T!_#o%T#p~%T7RM`ROzM]z{Mi{~M]7RMlTOzM]z{Mi{!PM]!P!QM{!Q~M]7RNQOU7R7ZNX^$UW}POYJlYZKoZzJlz{NQ{!PJl!P!Q! T!Q!^Jl!^!_!!]!_!}Jl!}#O!'|#O#P!+a#P#oJl#o#p!!]#p~Jl7Z! ^_$UWU7R}PO!^%T!_#Z%T#Z#[Er#[#]%T#]#^Er#^#a%T#a#bEr#b#g%T#g#hEr#h#i%T#i#jEr#j#m%T#m#nEr#n#o%T#p~%T7R!!bY}POY!!]YZM]Zz!!]z{!#Q{!P!!]!P!Q!&x!Q!}!!]!}#O!$`#O#P!&f#P~!!]7R!#VY}POY!!]YZM]Zz!!]z{!#Q{!P!!]!P!Q!#u!Q!}!!]!}#O!$`#O#P!&f#P~!!]7R!#|UU7R}P#Z#[Gd#]#^Gd#a#bGd#g#hGd#i#jGd#m#nGd7R!$cWOY!$`YZM]Zz!$`z{!${{#O!$`#O#P!&S#P#Q!!]#Q~!$`7R!%OYOY!$`YZM]Zz!$`z{!${{!P!$`!P!Q!%n!Q#O!$`#O#P!&S#P#Q!!]#Q~!$`7R!%sTU7ROYG{Z#OG{#O#PH_#P#QFx#Q~G{7R!&VTOY!$`YZM]Zz!$`z{!${{~!$`7R!&iTOY!!]YZM]Zz!!]z{!#Q{~!!]7R!&}_}POzM]z{Mi{#ZM]#Z#[!&x#[#]M]#]#^!&x#^#aM]#a#b!&x#b#gM]#g#h!&x#h#iM]#i#j!&x#j#mM]#m#n!&x#n~M]7Z!(R[$UWOY!'|YZKoZz!'|z{!(w{!^!'|!^!_!$`!_#O!'|#O#P!*o#P#QJl#Q#o!'|#o#p!$`#p~!'|7Z!(|^$UWOY!'|YZKoZz!'|z{!(w{!P!'|!P!Q!)x!Q!^!'|!^!_!$`!_#O!'|#O#P!*o#P#QJl#Q#o!'|#o#p!$`#p~!'|7Z!*PY$UWU7ROYHqYZ%TZ!^Hq!^!_G{!_#OHq#O#PIf#P#QDu#Q#oHq#o#pG{#p~Hq7Z!*tX$UWOY!'|YZKoZz!'|z{!(w{!^!'|!^!_!$`!_#o!'|#o#p!$`#p~!'|7Z!+fX$UWOYJlYZKoZzJlz{NQ{!^Jl!^!_!!]!_#oJl#o#p!!]#p~Jl7Z!,Yc$UW}POzKoz{LZ{!^Ko!^!_M]!_#ZKo#Z#[!,R#[#]Ko#]#^!,R#^#aKo#a#b!,R#b#gKo#g#h!,R#h#iKo#i#j!,R#j#mKo#m#n!,R#n#oKo#o#pM]#p~Ko7Z!-lV$UWT7ROY!-eYZ%TZ!^!-e!^!_!.R!_#o!-e#o#p!.R#p~!-e7R!.WQT7ROY!.RZ~!.R$P!.g[$UW#o#v}POYDuYZ%TZ!PDu!P!QEr!Q!^Du!^!_Fx!_!}Du!}#OHq#O#PJQ#P#oDu#o#pFx#p~Du]!/f[#wS$UW}POYDuYZ%TZ!PDu!P!QEr!Q!^Du!^!_Fx!_!}Du!}#OHq#O#PJQ#P#oDu#o#pFx#p~Du!{!0cd$UWk!sO!O%T!O!P@r!P!Q%T!Q![!1q![!^%T!_!g%T!g!hAl!h#R%T#R#S!1q#S#U%T#U#V!3X#V#X%T#X#YAl#Y#b%T#b#c!2w#c#d!4m#d#l%T#l#m!5{#m#o%T#p~%T!{!1x_$UWk!sO!O%T!O!P@r!P!Q%T!Q![!1q![!^%T!_!g%T!g!hAl!h#R%T#R#S!1q#S#X%T#X#YAl#Y#b%T#b#c!2w#c#o%T#p~%T!{!3OR$UWk!sO!^%T!_#o%T#p~%T!{!3^W$UWO!Q%T!Q!R!3v!R!S!3v!S!^%T!_#R%T#R#S!3v#S#o%T#p~%T!{!3}Y$UWk!sO!Q%T!Q!R!3v!R!S!3v!S!^%T!_#R%T#R#S!3v#S#b%T#b#c!2w#c#o%T#p~%T!{!4rV$UWO!Q%T!Q!Y!5X!Y!^%T!_#R%T#R#S!5X#S#o%T#p~%T!{!5`X$UWk!sO!Q%T!Q!Y!5X!Y!^%T!_#R%T#R#S!5X#S#b%T#b#c!2w#c#o%T#p~%T!{!6QZ$UWO!Q%T!Q![!6s![!^%T!_!c%T!c!i!6s!i#R%T#R#S!6s#S#T%T#T#Z!6s#Z#o%T#p~%T!{!6z]$UWk!sO!Q%T!Q![!6s![!^%T!_!c%T!c!i!6s!i#R%T#R#S!6s#S#T%T#T#Z!6s#Z#b%T#b#c!2w#c#o%T#p~%T$u!7|R!]V$UW#m$fO!^%T!_#o%T#p~%T!q!8^R_!i$UWO!^%T!_#o%T#p~%T5w!8rR'bd!a/n#x&s'|P!P!Q!8{!^!_!9Q!_!`!9_W!9QO$WW#v!9VP#`#v!_!`!9Y#v!9_O#o#v#v!9dO#a#v$u!9kT!{$m$UWO!^%T!_!`'v!`!a!9z!a#o%T#p~%T$P!:RR#W#w$UWO!^%T!_#o%T#p~%T%V!:gT'a!R#a#v$RS$UWO!^%T!_!`!:v!`!a!;W!a#o%T#p~%T$O!:}R#a#v$UWO!^%T!_#o%T#p~%T$O!;_T#`#v$UWO!^%T!_!`5T!`!a!;n!a#o%T#p~%T$O!;uS#`#v$UWO!^%T!_!`5T!`#o%T#p~%T*a!<YV'p#{$UWO!O%T!O!P!<o!P!^%T!_!a%T!a!b!=P!b#o%T#p~%T*[!<vRv*S$UWO!^%T!_#o%T#p~%T$O!=WS$UW#j#vO!^%T!_!`5T!`#o%T#p~%T7V!=kRx6}$UWO!^%T!_#o%T#p~%Tk!={R!Oc$UWO!^%T!_#o%T#p~%T$O!>]S#g#v$UWO!^%T!_!`5T!`#o%T#p~%T$a!>pR$UW'f$XO!^%T!_#o%T#p~%T~!?OO!T~5b!?VT'w5Y$UWO!^%T!_!`5T!`#o%T#p#q!=P#q~%T6X!?oR!S5}nQ$UWO!^%T!_#o%T#p~%TX!@PR!kP$UWO!^%T!_#o%T#p~%T7Z!@gr$UW'Y7R#zS']$y'g3SOX%TXY%cYZ%TZ[%c[p%Tpq%cqt%Ttu2`u}%T}!O3j!O!Q%T!Q![2`![!^%T!_!c%T!c!}2`!}#R%T#R#S2`#S#T%T#T#o2`#p$f%T$f$g%c$g#BY2`#BY#BZ!@Y#BZ$IS2`$IS$I_!@Y$I_$JT2`$JT$JU!@Y$JU$KV2`$KV$KW!@Y$KW&FU2`&FU&FV!@Y&FV?HT2`?HT?HU!@Y?HU~2`7Z!CO_$UW'Z7R#zS']$y'g3SOt%Ttu2`u}%T}!O3j!O!Q%T!Q![2`![!^%T!_!c%T!c!}2`!}#R%T#R#S2`#S#T%T#T#o2`#p$g%T$g~2`",
    tokenizers: [tsExtends, noSemicolon, incdecToken, template, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, insertSemicolon],
    topRules: {Script: [0, 7]},
    dialects: {jsx: 12107, ts: 12109},
    dynamicPrecedences: {"149": 1, "176": 1},
    specialized: [{term: 289, get: (value) => spec_identifier2[value] || -1}, {term: 299, get: (value) => spec_word[value] || -1}, {term: 63, get: (value) => spec_LessThan[value] || -1}],
    tokenPrec: 12130
  });

  // node_modules/@codemirror/lang-javascript/dist/index.js
  var snippets = [
    /* @__PURE__ */ snippetCompletion("function ${name}(${params}) {\n	${}\n}", {
      label: "function",
      detail: "definition",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("for (let ${index} = 0; ${index} < ${bound}; ${index}++) {\n	${}\n}", {
      label: "for",
      detail: "loop",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("for (let ${name} of ${collection}) {\n	${}\n}", {
      label: "for",
      detail: "of loop",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("do {\n	${}\n} while (${})", {
      label: "do",
      detail: "loop",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("while (${}) {\n	${}\n}", {
      label: "while",
      detail: "loop",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("try {\n	${}\n} catch (${error}) {\n	${}\n}", {
      label: "try",
      detail: "/ catch block",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("if (${}) {\n	${}\n}", {
      label: "if",
      detail: "block",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("if (${}) {\n	${}\n} else {\n	${}\n}", {
      label: "if",
      detail: "/ else block",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion("class ${name} {\n	constructor(${params}) {\n		${}\n	}\n}", {
      label: "class",
      detail: "definition",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion('import {${names}} from "${module}"\n${}', {
      label: "import",
      detail: "named",
      type: "keyword"
    }),
    /* @__PURE__ */ snippetCompletion('import ${name} from "${module}"\n${}', {
      label: "import",
      detail: "default",
      type: "keyword"
    })
  ];
  var cache = /* @__PURE__ */ new NodeWeakMap();
  var ScopeNodes = /* @__PURE__ */ new Set([
    "Script",
    "Block",
    "FunctionExpression",
    "FunctionDeclaration",
    "ArrowFunction",
    "MethodDeclaration",
    "ForStatement"
  ]);
  function defID(type) {
    return (node, def) => {
      let id2 = node.node.getChild("VariableDefinition");
      if (id2)
        def(id2, type);
      return true;
    };
  }
  var functionContext = ["FunctionDeclaration"];
  var gatherCompletions = {
    FunctionDeclaration: /* @__PURE__ */ defID("function"),
    ClassDeclaration: /* @__PURE__ */ defID("class"),
    ClassExpression: () => true,
    EnumDeclaration: /* @__PURE__ */ defID("constant"),
    TypeAliasDeclaration: /* @__PURE__ */ defID("type"),
    NamespaceDeclaration: /* @__PURE__ */ defID("namespace"),
    VariableDefinition(node, def) {
      if (!node.matchContext(functionContext))
        def(node, "variable");
    },
    TypeDefinition(node, def) {
      def(node, "type");
    },
    __proto__: null
  };
  function getScope(doc2, node) {
    let cached = cache.get(node);
    if (cached)
      return cached;
    let completions = [], top2 = true;
    function def(node2, type) {
      let name2 = doc2.sliceString(node2.from, node2.to);
      completions.push({label: name2, type});
    }
    node.cursor(IterMode.IncludeAnonymous).iterate((node2) => {
      if (top2) {
        top2 = false;
      } else if (node2.name) {
        let gather = gatherCompletions[node2.name];
        if (gather && gather(node2, def) || ScopeNodes.has(node2.name))
          return false;
      } else if (node2.to - node2.from > 8192) {
        for (let c of getScope(doc2, node2.node))
          completions.push(c);
        return false;
      }
    });
    cache.set(node, completions);
    return completions;
  }
  var Identifier = /^[\w$\xa1-\uffff][\w$\d\xa1-\uffff]*$/;
  var dontComplete = [
    "TemplateString",
    "String",
    "RegExp",
    "LineComment",
    "BlockComment",
    "VariableDefinition",
    "TypeDefinition",
    "Label",
    "PropertyDefinition",
    "PropertyName",
    "PrivatePropertyDefinition",
    "PrivatePropertyName"
  ];
  function localCompletionSource(context) {
    let inner = syntaxTree(context.state).resolveInner(context.pos, -1);
    if (dontComplete.indexOf(inner.name) > -1)
      return null;
    let isWord = inner.name == "VariableName" || inner.to - inner.from < 20 && Identifier.test(context.state.sliceDoc(inner.from, inner.to));
    if (!isWord && !context.explicit)
      return null;
    let options = [];
    for (let pos = inner; pos; pos = pos.parent) {
      if (ScopeNodes.has(pos.name))
        options = options.concat(getScope(context.state.doc, pos));
    }
    return {
      options,
      from: isWord ? inner.from : context.pos,
      validFor: Identifier
    };
  }
  var javascriptLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "javascript",
    parser: /* @__PURE__ */ parser4.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          IfStatement: /* @__PURE__ */ continuedIndent({except: /^\s*({|else\b)/}),
          TryStatement: /* @__PURE__ */ continuedIndent({except: /^\s*({|catch\b|finally\b)/}),
          LabeledStatement: flatIndent,
          SwitchBody: (context) => {
            let after = context.textAfter, closed = /^\s*\}/.test(after), isCase = /^\s*(case|default)\b/.test(after);
            return context.baseIndent + (closed ? 0 : isCase ? 1 : 2) * context.unit;
          },
          Block: /* @__PURE__ */ delimitedIndent({closing: "}"}),
          ArrowFunction: (cx) => cx.baseIndent + cx.unit,
          "TemplateString BlockComment": () => null,
          "Statement Property": /* @__PURE__ */ continuedIndent({except: /^{/}),
          JSXElement(context) {
            let closed = /^\s*<\//.test(context.textAfter);
            return context.lineIndent(context.node.from) + (closed ? 0 : context.unit);
          },
          JSXEscape(context) {
            let closed = /\s*\}/.test(context.textAfter);
            return context.lineIndent(context.node.from) + (closed ? 0 : context.unit);
          },
          "JSXOpenTag JSXSelfClosingTag"(context) {
            return context.column(context.node.from) + context.unit;
          }
        }),
        /* @__PURE__ */ foldNodeProp.add({
          "Block ClassBody SwitchBody EnumBody ObjectExpression ArrayExpression": foldInside,
          BlockComment(tree) {
            return {from: tree.from + 2, to: tree.to - 2};
          }
        })
      ]
    }),
    languageData: {
      closeBrackets: {brackets: ["(", "[", "{", "'", '"', "`"]},
      commentTokens: {line: "//", block: {open: "/*", close: "*/"}},
      indentOnInput: /^\s*(?:case |default:|\{|\}|<\/)$/,
      wordChars: "$"
    }
  });
  var typescriptLanguage = /* @__PURE__ */ javascriptLanguage.configure({dialect: "ts"}, "typescript");
  var jsxLanguage = /* @__PURE__ */ javascriptLanguage.configure({dialect: "jsx"});
  var tsxLanguage = /* @__PURE__ */ javascriptLanguage.configure({dialect: "jsx ts"}, "typescript");
  var keywords = /* @__PURE__ */ "break case const continue default delete export extends false finally in instanceof let new return static super switch this throw true typeof var yield".split(" ").map((kw) => ({label: kw, type: "keyword"}));
  function javascript(config = {}) {
    let lang = config.jsx ? config.typescript ? tsxLanguage : jsxLanguage : config.typescript ? typescriptLanguage : javascriptLanguage;
    return new LanguageSupport(lang, [
      javascriptLanguage.data.of({
        autocomplete: ifNotIn(dontComplete, completeFromList(snippets.concat(keywords)))
      }),
      javascriptLanguage.data.of({
        autocomplete: localCompletionSource
      }),
      config.jsx ? autoCloseTags : []
    ]);
  }
  function elementName(doc2, tree, max = doc2.length) {
    if (!tree)
      return "";
    let name2 = tree.getChild("JSXIdentifier");
    return name2 ? doc2.sliceString(name2.from, Math.min(name2.to, max)) : "";
  }
  var android2 = typeof navigator == "object" && /* @__PURE__ */ /Android\b/.test(navigator.userAgent);
  var autoCloseTags = /* @__PURE__ */ EditorView.inputHandler.of((view, from, to, text) => {
    if ((android2 ? view.composing : view.compositionStarted) || view.state.readOnly || from != to || text != ">" && text != "/" || !javascriptLanguage.isActiveAt(view.state, from, -1))
      return false;
    let {state} = view;
    let changes = state.changeByRange((range) => {
      var _a2, _b, _c;
      let {head} = range, around = syntaxTree(state).resolveInner(head, -1), name2;
      if (around.name == "JSXStartTag")
        around = around.parent;
      if (text == ">" && around.name == "JSXFragmentTag") {
        return {range: EditorSelection.cursor(head + 1), changes: {from: head, insert: `><>`}};
      } else if (text == ">" && around.name == "JSXIdentifier") {
        if (((_b = (_a2 = around.parent) === null || _a2 === void 0 ? void 0 : _a2.lastChild) === null || _b === void 0 ? void 0 : _b.name) != "JSXEndTag" && (name2 = elementName(state.doc, around.parent, head)))
          return {range: EditorSelection.cursor(head + 1), changes: {from: head, insert: `></${name2}>`}};
      } else if (text == "/" && around.name == "JSXFragmentTag") {
        let empty = around.parent, base2 = empty === null || empty === void 0 ? void 0 : empty.parent;
        if (empty.from == head - 1 && ((_c = base2.lastChild) === null || _c === void 0 ? void 0 : _c.name) != "JSXEndTag" && (name2 = elementName(state.doc, base2 === null || base2 === void 0 ? void 0 : base2.firstChild, head))) {
          let insert2 = `/${name2}>`;
          return {range: EditorSelection.cursor(head + insert2.length), changes: {from: head, insert: insert2}};
        }
      }
      return {range};
    });
    if (changes.changes.empty)
      return false;
    view.dispatch(changes, {userEvent: "input.type", scrollIntoView: true});
    return true;
  });

  // node_modules/@codemirror/lang-html/dist/index.js
  var Targets = ["_blank", "_self", "_top", "_parent"];
  var Charsets = ["ascii", "utf-8", "utf-16", "latin1", "latin1"];
  var Methods = ["get", "post", "put", "delete"];
  var Encs = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
  var Bool = ["true", "false"];
  var S = {};
  var Tags = {
    a: {
      attrs: {
        href: null,
        ping: null,
        type: null,
        media: null,
        target: Targets,
        hreflang: null
      }
    },
    abbr: S,
    address: S,
    area: {
      attrs: {
        alt: null,
        coords: null,
        href: null,
        target: null,
        ping: null,
        media: null,
        hreflang: null,
        type: null,
        shape: ["default", "rect", "circle", "poly"]
      }
    },
    article: S,
    aside: S,
    audio: {
      attrs: {
        src: null,
        mediagroup: null,
        crossorigin: ["anonymous", "use-credentials"],
        preload: ["none", "metadata", "auto"],
        autoplay: ["autoplay"],
        loop: ["loop"],
        controls: ["controls"]
      }
    },
    b: S,
    base: {attrs: {href: null, target: Targets}},
    bdi: S,
    bdo: S,
    blockquote: {attrs: {cite: null}},
    body: S,
    br: S,
    button: {
      attrs: {
        form: null,
        formaction: null,
        name: null,
        value: null,
        autofocus: ["autofocus"],
        disabled: ["autofocus"],
        formenctype: Encs,
        formmethod: Methods,
        formnovalidate: ["novalidate"],
        formtarget: Targets,
        type: ["submit", "reset", "button"]
      }
    },
    canvas: {attrs: {width: null, height: null}},
    caption: S,
    center: S,
    cite: S,
    code: S,
    col: {attrs: {span: null}},
    colgroup: {attrs: {span: null}},
    command: {
      attrs: {
        type: ["command", "checkbox", "radio"],
        label: null,
        icon: null,
        radiogroup: null,
        command: null,
        title: null,
        disabled: ["disabled"],
        checked: ["checked"]
      }
    },
    data: {attrs: {value: null}},
    datagrid: {attrs: {disabled: ["disabled"], multiple: ["multiple"]}},
    datalist: {attrs: {data: null}},
    dd: S,
    del: {attrs: {cite: null, datetime: null}},
    details: {attrs: {open: ["open"]}},
    dfn: S,
    div: S,
    dl: S,
    dt: S,
    em: S,
    embed: {attrs: {src: null, type: null, width: null, height: null}},
    eventsource: {attrs: {src: null}},
    fieldset: {attrs: {disabled: ["disabled"], form: null, name: null}},
    figcaption: S,
    figure: S,
    footer: S,
    form: {
      attrs: {
        action: null,
        name: null,
        "accept-charset": Charsets,
        autocomplete: ["on", "off"],
        enctype: Encs,
        method: Methods,
        novalidate: ["novalidate"],
        target: Targets
      }
    },
    h1: S,
    h2: S,
    h3: S,
    h4: S,
    h5: S,
    h6: S,
    head: {
      children: ["title", "base", "link", "style", "meta", "script", "noscript", "command"]
    },
    header: S,
    hgroup: S,
    hr: S,
    html: {
      attrs: {manifest: null}
    },
    i: S,
    iframe: {
      attrs: {
        src: null,
        srcdoc: null,
        name: null,
        width: null,
        height: null,
        sandbox: ["allow-top-navigation", "allow-same-origin", "allow-forms", "allow-scripts"],
        seamless: ["seamless"]
      }
    },
    img: {
      attrs: {
        alt: null,
        src: null,
        ismap: null,
        usemap: null,
        width: null,
        height: null,
        crossorigin: ["anonymous", "use-credentials"]
      }
    },
    input: {
      attrs: {
        alt: null,
        dirname: null,
        form: null,
        formaction: null,
        height: null,
        list: null,
        max: null,
        maxlength: null,
        min: null,
        name: null,
        pattern: null,
        placeholder: null,
        size: null,
        src: null,
        step: null,
        value: null,
        width: null,
        accept: ["audio/*", "video/*", "image/*"],
        autocomplete: ["on", "off"],
        autofocus: ["autofocus"],
        checked: ["checked"],
        disabled: ["disabled"],
        formenctype: Encs,
        formmethod: Methods,
        formnovalidate: ["novalidate"],
        formtarget: Targets,
        multiple: ["multiple"],
        readonly: ["readonly"],
        required: ["required"],
        type: [
          "hidden",
          "text",
          "search",
          "tel",
          "url",
          "email",
          "password",
          "datetime",
          "date",
          "month",
          "week",
          "time",
          "datetime-local",
          "number",
          "range",
          "color",
          "checkbox",
          "radio",
          "file",
          "submit",
          "image",
          "reset",
          "button"
        ]
      }
    },
    ins: {attrs: {cite: null, datetime: null}},
    kbd: S,
    keygen: {
      attrs: {
        challenge: null,
        form: null,
        name: null,
        autofocus: ["autofocus"],
        disabled: ["disabled"],
        keytype: ["RSA"]
      }
    },
    label: {attrs: {for: null, form: null}},
    legend: S,
    li: {attrs: {value: null}},
    link: {
      attrs: {
        href: null,
        type: null,
        hreflang: null,
        media: null,
        sizes: ["all", "16x16", "16x16 32x32", "16x16 32x32 64x64"]
      }
    },
    map: {attrs: {name: null}},
    mark: S,
    menu: {attrs: {label: null, type: ["list", "context", "toolbar"]}},
    meta: {
      attrs: {
        content: null,
        charset: Charsets,
        name: ["viewport", "application-name", "author", "description", "generator", "keywords"],
        "http-equiv": ["content-language", "content-type", "default-style", "refresh"]
      }
    },
    meter: {attrs: {value: null, min: null, low: null, high: null, max: null, optimum: null}},
    nav: S,
    noscript: S,
    object: {
      attrs: {
        data: null,
        type: null,
        name: null,
        usemap: null,
        form: null,
        width: null,
        height: null,
        typemustmatch: ["typemustmatch"]
      }
    },
    ol: {
      attrs: {reversed: ["reversed"], start: null, type: ["1", "a", "A", "i", "I"]},
      children: ["li", "script", "template", "ul", "ol"]
    },
    optgroup: {attrs: {disabled: ["disabled"], label: null}},
    option: {attrs: {disabled: ["disabled"], label: null, selected: ["selected"], value: null}},
    output: {attrs: {for: null, form: null, name: null}},
    p: S,
    param: {attrs: {name: null, value: null}},
    pre: S,
    progress: {attrs: {value: null, max: null}},
    q: {attrs: {cite: null}},
    rp: S,
    rt: S,
    ruby: S,
    samp: S,
    script: {
      attrs: {
        type: ["text/javascript"],
        src: null,
        async: ["async"],
        defer: ["defer"],
        charset: Charsets
      }
    },
    section: S,
    select: {
      attrs: {
        form: null,
        name: null,
        size: null,
        autofocus: ["autofocus"],
        disabled: ["disabled"],
        multiple: ["multiple"]
      }
    },
    slot: {attrs: {name: null}},
    small: S,
    source: {attrs: {src: null, type: null, media: null}},
    span: S,
    strong: S,
    style: {
      attrs: {
        type: ["text/css"],
        media: null,
        scoped: null
      }
    },
    sub: S,
    summary: S,
    sup: S,
    table: S,
    tbody: S,
    td: {attrs: {colspan: null, rowspan: null, headers: null}},
    template: S,
    textarea: {
      attrs: {
        dirname: null,
        form: null,
        maxlength: null,
        name: null,
        placeholder: null,
        rows: null,
        cols: null,
        autofocus: ["autofocus"],
        disabled: ["disabled"],
        readonly: ["readonly"],
        required: ["required"],
        wrap: ["soft", "hard"]
      }
    },
    tfoot: S,
    th: {attrs: {colspan: null, rowspan: null, headers: null, scope: ["row", "col", "rowgroup", "colgroup"]}},
    thead: S,
    time: {attrs: {datetime: null}},
    title: S,
    tr: S,
    track: {
      attrs: {
        src: null,
        label: null,
        default: null,
        kind: ["subtitles", "captions", "descriptions", "chapters", "metadata"],
        srclang: null
      }
    },
    ul: {children: ["li", "script", "template", "ul", "ol"]},
    var: S,
    video: {
      attrs: {
        src: null,
        poster: null,
        width: null,
        height: null,
        crossorigin: ["anonymous", "use-credentials"],
        preload: ["auto", "metadata", "none"],
        autoplay: ["autoplay"],
        mediagroup: ["movie"],
        muted: ["muted"],
        controls: ["controls"]
      }
    },
    wbr: S
  };
  var GlobalAttrs = {
    accesskey: null,
    class: null,
    contenteditable: Bool,
    contextmenu: null,
    dir: ["ltr", "rtl", "auto"],
    draggable: ["true", "false", "auto"],
    dropzone: ["copy", "move", "link", "string:", "file:"],
    hidden: ["hidden"],
    id: null,
    inert: ["inert"],
    itemid: null,
    itemprop: null,
    itemref: null,
    itemscope: ["itemscope"],
    itemtype: null,
    lang: ["ar", "bn", "de", "en-GB", "en-US", "es", "fr", "hi", "id", "ja", "pa", "pt", "ru", "tr", "zh"],
    spellcheck: Bool,
    autocorrect: Bool,
    autocapitalize: Bool,
    style: null,
    tabindex: null,
    title: null,
    translate: ["yes", "no"],
    onclick: null,
    rel: ["stylesheet", "alternate", "author", "bookmark", "help", "license", "next", "nofollow", "noreferrer", "prefetch", "prev", "search", "tag"],
    role: /* @__PURE__ */ "alert application article banner button cell checkbox complementary contentinfo dialog document feed figure form grid gridcell heading img list listbox listitem main navigation region row rowgroup search switch tab table tabpanel textbox timer".split(" "),
    "aria-activedescendant": null,
    "aria-atomic": Bool,
    "aria-autocomplete": ["inline", "list", "both", "none"],
    "aria-busy": Bool,
    "aria-checked": ["true", "false", "mixed", "undefined"],
    "aria-controls": null,
    "aria-describedby": null,
    "aria-disabled": Bool,
    "aria-dropeffect": null,
    "aria-expanded": ["true", "false", "undefined"],
    "aria-flowto": null,
    "aria-grabbed": ["true", "false", "undefined"],
    "aria-haspopup": Bool,
    "aria-hidden": Bool,
    "aria-invalid": ["true", "false", "grammar", "spelling"],
    "aria-label": null,
    "aria-labelledby": null,
    "aria-level": null,
    "aria-live": ["off", "polite", "assertive"],
    "aria-multiline": Bool,
    "aria-multiselectable": Bool,
    "aria-owns": null,
    "aria-posinset": null,
    "aria-pressed": ["true", "false", "mixed", "undefined"],
    "aria-readonly": Bool,
    "aria-relevant": null,
    "aria-required": Bool,
    "aria-selected": ["true", "false", "undefined"],
    "aria-setsize": null,
    "aria-sort": ["ascending", "descending", "none", "other"],
    "aria-valuemax": null,
    "aria-valuemin": null,
    "aria-valuenow": null,
    "aria-valuetext": null
  };
  var Schema = class {
    constructor(extraTags, extraAttrs) {
      this.tags = Object.assign(Object.assign({}, Tags), extraTags);
      this.globalAttrs = Object.assign(Object.assign({}, GlobalAttrs), extraAttrs);
      this.allTags = Object.keys(this.tags);
      this.globalAttrNames = Object.keys(this.globalAttrs);
    }
  };
  Schema.default = /* @__PURE__ */ new Schema();
  function elementName2(doc2, tree, max = doc2.length) {
    if (!tree)
      return "";
    let tag = tree.firstChild;
    let name2 = tag && tag.getChild("TagName");
    return name2 ? doc2.sliceString(name2.from, Math.min(name2.to, max)) : "";
  }
  function findParentElement(tree, skip = false) {
    for (let cur2 = tree.parent; cur2; cur2 = cur2.parent)
      if (cur2.name == "Element") {
        if (skip)
          skip = false;
        else
          return cur2;
      }
    return null;
  }
  function allowedChildren(doc2, tree, schema) {
    let parentInfo = schema.tags[elementName2(doc2, findParentElement(tree, true))];
    return (parentInfo === null || parentInfo === void 0 ? void 0 : parentInfo.children) || schema.allTags;
  }
  function openTags(doc2, tree) {
    let open = [];
    for (let parent = tree; parent = findParentElement(parent); ) {
      let tagName2 = elementName2(doc2, parent);
      if (tagName2 && parent.lastChild.name == "CloseTag")
        break;
      if (tagName2 && open.indexOf(tagName2) < 0 && (tree.name == "EndTag" || tree.from >= parent.firstChild.to))
        open.push(tagName2);
    }
    return open;
  }
  var identifier3 = /^[:\-\.\w\u00b7-\uffff]*$/;
  function completeTag(state, schema, tree, from, to) {
    let end = /\s*>/.test(state.sliceDoc(to, to + 5)) ? "" : ">";
    return {
      from,
      to,
      options: allowedChildren(state.doc, tree, schema).map((tagName2) => ({label: tagName2, type: "type"})).concat(openTags(state.doc, tree).map((tag, i) => ({
        label: "/" + tag,
        apply: "/" + tag + end,
        type: "type",
        boost: 99 - i
      }))),
      validFor: /^\/?[:\-\.\w\u00b7-\uffff]*$/
    };
  }
  function completeCloseTag(state, tree, from, to) {
    let end = /\s*>/.test(state.sliceDoc(to, to + 5)) ? "" : ">";
    return {
      from,
      to,
      options: openTags(state.doc, tree).map((tag, i) => ({label: tag, apply: tag + end, type: "type", boost: 99 - i})),
      validFor: identifier3
    };
  }
  function completeStartTag(state, schema, tree, pos) {
    let options = [], level = 0;
    for (let tagName2 of allowedChildren(state.doc, tree, schema))
      options.push({label: "<" + tagName2, type: "type"});
    for (let open of openTags(state.doc, tree))
      options.push({label: "</" + open + ">", type: "type", boost: 99 - level++});
    return {from: pos, to: pos, options, validFor: /^<\/?[:\-\.\w\u00b7-\uffff]*$/};
  }
  function completeAttrName(state, schema, tree, from, to) {
    let elt2 = findParentElement(tree), info = elt2 ? schema.tags[elementName2(state.doc, elt2)] : null;
    let names = info && info.attrs ? Object.keys(info.attrs).concat(schema.globalAttrNames) : schema.globalAttrNames;
    return {
      from,
      to,
      options: names.map((attrName2) => ({label: attrName2, type: "property"})),
      validFor: identifier3
    };
  }
  function completeAttrValue(state, schema, tree, from, to) {
    var _a2;
    let nameNode = (_a2 = tree.parent) === null || _a2 === void 0 ? void 0 : _a2.getChild("AttributeName");
    let options = [], token = void 0;
    if (nameNode) {
      let attrName2 = state.sliceDoc(nameNode.from, nameNode.to);
      let attrs = schema.globalAttrs[attrName2];
      if (!attrs) {
        let elt2 = findParentElement(tree), info = elt2 ? schema.tags[elementName2(state.doc, elt2)] : null;
        attrs = (info === null || info === void 0 ? void 0 : info.attrs) && info.attrs[attrName2];
      }
      if (attrs) {
        let base2 = state.sliceDoc(from, to).toLowerCase(), quoteStart = '"', quoteEnd = '"';
        if (/^['"]/.test(base2)) {
          token = base2[0] == '"' ? /^[^"]*$/ : /^[^']*$/;
          quoteStart = "";
          quoteEnd = state.sliceDoc(to, to + 1) == base2[0] ? "" : base2[0];
          base2 = base2.slice(1);
          from++;
        } else {
          token = /^[^\s<>='"]*$/;
        }
        for (let value of attrs)
          options.push({label: value, apply: quoteStart + value + quoteEnd, type: "constant"});
      }
    }
    return {from, to, options, validFor: token};
  }
  function htmlCompletionFor(schema, context) {
    let {state, pos} = context, around = syntaxTree(state).resolveInner(pos), tree = around.resolve(pos, -1);
    for (let scan = pos, before; around == tree && (before = tree.childBefore(scan)); ) {
      let last = before.lastChild;
      if (!last || !last.type.isError || last.from < last.to)
        break;
      around = tree = before;
      scan = last.from;
    }
    if (tree.name == "TagName") {
      return tree.parent && /CloseTag$/.test(tree.parent.name) ? completeCloseTag(state, tree, tree.from, pos) : completeTag(state, schema, tree, tree.from, pos);
    } else if (tree.name == "StartTag") {
      return completeTag(state, schema, tree, pos, pos);
    } else if (tree.name == "StartCloseTag" || tree.name == "IncompleteCloseTag") {
      return completeCloseTag(state, tree, pos, pos);
    } else if (context.explicit && (tree.name == "OpenTag" || tree.name == "SelfClosingTag") || tree.name == "AttributeName") {
      return completeAttrName(state, schema, tree, tree.name == "AttributeName" ? tree.from : pos, pos);
    } else if (tree.name == "Is" || tree.name == "AttributeValue" || tree.name == "UnquotedAttributeValue") {
      return completeAttrValue(state, schema, tree, tree.name == "Is" ? pos : tree.from, pos);
    } else if (context.explicit && (around.name == "Element" || around.name == "Text" || around.name == "Document")) {
      return completeStartTag(state, schema, tree, pos);
    } else {
      return null;
    }
  }
  function htmlCompletionSourceWith(config) {
    let {extraTags, extraGlobalAttributes: extraAttrs} = config;
    let schema = extraAttrs || extraTags ? new Schema(extraTags, extraAttrs) : Schema.default;
    return (context) => htmlCompletionFor(schema, context);
  }
  var htmlLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "html",
    parser: /* @__PURE__ */ parser3.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          Element(context) {
            let after = /^(\s*)(<\/)?/.exec(context.textAfter);
            if (context.node.to <= context.pos + after[0].length)
              return context.continue();
            return context.lineIndent(context.node.from) + (after[2] ? 0 : context.unit);
          },
          "OpenTag CloseTag SelfClosingTag"(context) {
            return context.column(context.node.from) + context.unit;
          },
          Document(context) {
            if (context.pos + /\s*/.exec(context.textAfter)[0].length < context.node.to)
              return context.continue();
            let endElt = null, close;
            for (let cur2 = context.node; ; ) {
              let last = cur2.lastChild;
              if (!last || last.name != "Element" || last.to != cur2.to)
                break;
              endElt = cur2 = last;
            }
            if (endElt && !((close = endElt.lastChild) && (close.name == "CloseTag" || close.name == "SelfClosingTag")))
              return context.lineIndent(endElt.from) + context.unit;
            return null;
          }
        }),
        /* @__PURE__ */ foldNodeProp.add({
          Element(node) {
            let first = node.firstChild, last = node.lastChild;
            if (!first || first.name != "OpenTag")
              return null;
            return {from: first.to, to: last.name == "CloseTag" ? last.from : node.to};
          }
        })
      ],
      wrap: /* @__PURE__ */ configureNesting([
        {
          tag: "script",
          attrs: (attrs) => attrs.type == "text/typescript" || attrs.lang == "ts",
          parser: typescriptLanguage.parser
        },
        {
          tag: "script",
          attrs: (attrs) => attrs.type == "text/jsx",
          parser: jsxLanguage.parser
        },
        {
          tag: "script",
          attrs: (attrs) => attrs.type == "text/typescript-jsx",
          parser: tsxLanguage.parser
        },
        {
          tag: "script",
          attrs(attrs) {
            return !attrs.type || /^(?:text|application)\/(?:x-)?(?:java|ecma)script$|^module$|^$/i.test(attrs.type);
          },
          parser: javascriptLanguage.parser
        },
        {
          tag: "style",
          attrs(attrs) {
            return (!attrs.lang || attrs.lang == "css") && (!attrs.type || /^(text\/)?(x-)?(stylesheet|css)$/i.test(attrs.type));
          },
          parser: cssLanguage.parser
        }
      ])
    }),
    languageData: {
      commentTokens: {block: {open: "<!--", close: "-->"}},
      indentOnInput: /^\s*<\/\w+\W$/,
      wordChars: "-._"
    }
  });
  function html(config = {}) {
    let lang = htmlLanguage;
    if (config.matchClosingTags === false)
      lang = lang.configure({dialect: "noMatch"});
    return new LanguageSupport(lang, [
      htmlLanguage.data.of({autocomplete: htmlCompletionSourceWith(config)}),
      config.autoCloseTags !== false ? autoCloseTags2 : [],
      javascript().support,
      css().support
    ]);
  }
  var autoCloseTags2 = /* @__PURE__ */ EditorView.inputHandler.of((view, from, to, text) => {
    if (view.composing || view.state.readOnly || from != to || text != ">" && text != "/" || !htmlLanguage.isActiveAt(view.state, from, -1))
      return false;
    let {state} = view;
    let changes = state.changeByRange((range) => {
      var _a2, _b, _c;
      let {head} = range, around = syntaxTree(state).resolveInner(head, -1), name2;
      if (around.name == "TagName" || around.name == "StartTag")
        around = around.parent;
      if (text == ">" && around.name == "OpenTag") {
        if (((_b = (_a2 = around.parent) === null || _a2 === void 0 ? void 0 : _a2.lastChild) === null || _b === void 0 ? void 0 : _b.name) != "CloseTag" && (name2 = elementName2(state.doc, around.parent, head))) {
          let hasRightBracket = view.state.doc.sliceString(head, head + 1) === ">";
          let insert2 = `${hasRightBracket ? "" : ">"}</${name2}>`;
          return {range: EditorSelection.cursor(head + 1), changes: {from: head + (hasRightBracket ? 1 : 0), insert: insert2}};
        }
      } else if (text == "/" && around.name == "OpenTag") {
        let empty = around.parent, base2 = empty === null || empty === void 0 ? void 0 : empty.parent;
        if (empty.from == head - 1 && ((_c = base2.lastChild) === null || _c === void 0 ? void 0 : _c.name) != "CloseTag" && (name2 = elementName2(state.doc, base2, head))) {
          let hasRightBracket = view.state.doc.sliceString(head, head + 1) === ">";
          let insert2 = `/${name2}${hasRightBracket ? "" : ">"}`;
          let pos = head + insert2.length + (hasRightBracket ? 1 : 0);
          return {range: EditorSelection.cursor(pos), changes: {from: head, insert: insert2}};
        }
      }
      return {range};
    });
    if (changes.changes.empty)
      return false;
    view.dispatch(changes, {userEvent: "input.type", scrollIntoView: true});
    return true;
  });

  // node_modules/@lezer/xml/dist/index.es.js
  var StartTag2 = 1;
  var StartCloseTag2 = 2;
  var MissingCloseTag = 3;
  var mismatchedStartCloseTag = 4;
  var incompleteStartCloseTag = 5;
  var commentContent$12 = 35;
  var piContent$1 = 36;
  var cdataContent$1 = 37;
  var Element2 = 11;
  var OpenTag2 = 13;
  function nameChar2(ch) {
    return ch == 45 || ch == 46 || ch == 58 || ch >= 65 && ch <= 90 || ch == 95 || ch >= 97 && ch <= 122 || ch >= 161;
  }
  function isSpace2(ch) {
    return ch == 9 || ch == 10 || ch == 13 || ch == 32;
  }
  var cachedName2 = null;
  var cachedInput2 = null;
  var cachedPos2 = 0;
  function tagNameAfter2(input, offset) {
    let pos = input.pos + offset;
    if (cachedInput2 == input && cachedPos2 == pos)
      return cachedName2;
    while (isSpace2(input.peek(offset)))
      offset++;
    let name2 = "";
    for (; ; ) {
      let next = input.peek(offset);
      if (!nameChar2(next))
        break;
      name2 += String.fromCharCode(next);
      offset++;
    }
    cachedInput2 = input;
    cachedPos2 = pos;
    return cachedName2 = name2 || null;
  }
  function ElementContext2(name2, parent) {
    this.name = name2;
    this.parent = parent;
    this.hash = parent ? parent.hash : 0;
    for (let i = 0; i < name2.length; i++)
      this.hash += (this.hash << 4) + name2.charCodeAt(i) + (name2.charCodeAt(i) << 8);
  }
  var elementContext2 = new ContextTracker({
    start: null,
    shift(context, term, stack, input) {
      return term == StartTag2 ? new ElementContext2(tagNameAfter2(input, 1) || "", context) : context;
    },
    reduce(context, term) {
      return term == Element2 && context ? context.parent : context;
    },
    reuse(context, node, _stack, input) {
      let type = node.type.id;
      return type == StartTag2 || type == OpenTag2 ? new ElementContext2(tagNameAfter2(input, 1) || "", context) : context;
    },
    hash(context) {
      return context ? context.hash : 0;
    },
    strict: false
  });
  var startTag = new ExternalTokenizer((input, stack) => {
    if (input.next != 60)
      return;
    input.advance();
    if (input.next == 47) {
      input.advance();
      let name2 = tagNameAfter2(input, 0);
      if (!name2)
        return input.acceptToken(incompleteStartCloseTag);
      if (stack.context && name2 == stack.context.name)
        return input.acceptToken(StartCloseTag2);
      for (let cx = stack.context; cx; cx = cx.parent)
        if (cx.name == name2)
          return input.acceptToken(MissingCloseTag, -2);
      input.acceptToken(mismatchedStartCloseTag);
    } else if (input.next != 33 && input.next != 63) {
      return input.acceptToken(StartTag2);
    }
  }, {contextual: true});
  function scanTo(type, end) {
    return new ExternalTokenizer((input) => {
      for (let endPos = 0, len = 0; ; len++) {
        if (input.next < 0) {
          if (len)
            input.acceptToken(type);
          break;
        }
        if (input.next == end.charCodeAt(endPos)) {
          endPos++;
          if (endPos == end.length) {
            if (len > end.length)
              input.acceptToken(type, 1 - end.length);
            break;
          }
        } else {
          endPos = input.next == end.charCodeAt(0) ? 1 : 0;
        }
        input.advance();
      }
    });
  }
  var commentContent2 = scanTo(commentContent$12, "-->");
  var piContent = scanTo(piContent$1, "?>");
  var cdataContent = scanTo(cdataContent$1, "]]>");
  var xmlHighlighting = styleTags({
    Text: tags.content,
    "StartTag StartCloseTag EndTag SelfCloseEndTag": tags.angleBracket,
    TagName: tags.tagName,
    "MismatchedCloseTag/Tagname": [tags.tagName, tags.invalid],
    AttributeName: tags.attributeName,
    AttributeValue: tags.attributeValue,
    Is: tags.definitionOperator,
    "EntityReference CharacterReference": tags.character,
    Comment: tags.blockComment,
    ProcessingInst: tags.processingInstruction,
    DoctypeDecl: tags.documentMeta,
    Cdata: tags.special(tags.string)
  });
  var parser5 = LRParser.deserialize({
    version: 14,
    states: ",SOQOaOOOrOxO'#CfOzOpO'#CiO!tOaO'#CgOOOP'#Cg'#CgO!{OrO'#CrO#TOtO'#CsO#]OpO'#CtOOOP'#DS'#DSOOOP'#Cv'#CvQQOaOOOOOW'#Cw'#CwO#eOxO,59QOOOP,59Q,59QOOOO'#Cx'#CxO#mOpO,59TO#uO!bO,59TOOOP'#C{'#C{O$TOaO,59RO$[OpO'#CoOOOP,59R,59ROOOQ'#C|'#C|O$dOrO,59^OOOP,59^,59^OOOS'#C}'#C}O$lOtO,59_OOOP,59_,59_O$tOpO,59`O$|OpO,59`OOOP-E6t-E6tOOOW-E6u-E6uOOOP1G.l1G.lOOOO-E6v-E6vO%UO!bO1G.oO%UO!bO1G.oO%dOpO'#CkO%lO!bO'#CyO%zO!bO1G.oOOOP1G.o1G.oOOOP1G.w1G.wOOOP-E6y-E6yOOOP1G.m1G.mO&VOpO,59ZO&_OpO,59ZOOOQ-E6z-E6zOOOP1G.x1G.xOOOS-E6{-E6{OOOP1G.y1G.yO&gOpO1G.zO&gOpO1G.zOOOP1G.z1G.zO&oO!bO7+$ZO&}O!bO7+$ZOOOP7+$Z7+$ZOOOP7+$c7+$cO'YOpO,59VO'bOpO,59VO'jO!bO,59eOOOO-E6w-E6wO'xOpO1G.uO'xOpO1G.uOOOP1G.u1G.uO(QOpO7+$fOOOP7+$f7+$fO(YO!bO<<GuOOOP<<Gu<<GuOOOP<<G}<<G}O'bOpO1G.qO'bOpO1G.qO(eO#tO'#CnOOOO1G.q1G.qO(sOpO7+$aOOOP7+$a7+$aOOOP<<HQ<<HQOOOPAN=aAN=aOOOPAN=iAN=iO'bOpO7+$]OOOO7+$]7+$]OOOO'#Cz'#CzO({O#tO,59YOOOO,59Y,59YOOOP<<G{<<G{OOOO<<Gw<<GwOOOO-E6x-E6xOOOO1G.t1G.t",
    stateData: ")Z~OPQOSVOTWOVWOWWOXWOiXOxPO}TO!PUO~OuZOw]O~O^`Oy^O~OPQOQcOSVOTWOVWOWWOXWOxPO}TO!PUO~ORdO~P!SOseO|gO~OthO!OjO~O^lOy^O~OuZOwoO~O^qOy^O~O[vO`sOdwOy^O~ORyO~P!SO^{Oy^O~OseO|}O~OthO!O!PO~O^!QOy^O~O[!SOy^O~O[!VO`sOd!WOy^O~Oa!YOy^O~Oy^O[mX`mXdmX~O[!VO`sOd!WO~O^!]Oy^O~O[!_Oy^O~O[!aOy^O~O[!cO`sOd!dOy^O~O[!cO`sOd!dO~Oa!eOy^O~Oy^Oz!gO~Oy^O[ma`madma~O[!jOy^O~O[!kOy^O~O[!lO`sOd!mO~OW!pOX!pOz!rO{!pO~O[!sOy^O~OW!pOX!pOz!vO{!pO~O",
    goto: "%[wPPPPPPPPPPxxP!OP!UPP!_!iP!oxxxP!u!{#R$Z$j$p$v$|PPPP%SXWORYbXRORYb_t`qru!T!U!bQ!h!YS!o!e!fR!t!nQdRRybXSORYbQYORmYQ[PRn[Q_QQkVjp_krz!R!T!X!Z!^!`!f!i!nQr`QzcQ!RlQ!TqQ!XsQ!ZtQ!^{Q!`!QQ!f!YQ!i!]R!n!eQu`S!UqrU![u!U!bR!b!TQ!q!gR!u!qQbRRxbQfTR|fQiUR!OiSXOYTaRb",
    nodeNames: "\u26A0 StartTag StartCloseTag MissingCloseTag StartCloseTag StartCloseTag Document Text EntityReference CharacterReference Cdata Element EndTag OpenTag TagName Attribute AttributeName Is AttributeValue CloseTag SelfCloseEndTag SelfClosingTag Comment ProcessingInst MismatchedCloseTag DoctypeDecl",
    maxTerm: 47,
    context: elementContext2,
    nodeProps: [
      ["closedBy", 1, "SelfCloseEndTag EndTag", 13, "CloseTag MissingCloseTag"],
      ["openedBy", 12, "StartTag StartCloseTag", 19, "OpenTag", 20, "StartTag"]
    ],
    propSources: [xmlHighlighting],
    skippedNodes: [0],
    repeatNodeCount: 8,
    tokenData: "Az~R!WOX$kXY%rYZ%rZ]$k]^%r^p$kpq%rqr$krs&tsv$kvw'Uw}$k}!O(q!O!P$k!P!Q*n!Q![$k![!]+z!]!^$k!^!_/s!_!`=i!`!a>U!a!b>q!b!c$k!c!}+z!}#P$k#P#Q?}#Q#R$k#R#S+z#S#T$k#T#o+z#o%W$k%W%o+z%o%p$k%p&a+z&a&b$k&b1p+z1p4U$k4U4d+z4d4e$k4e$IS+z$IS$I`$k$I`$Ib+z$Ib$Kh$k$Kh%#t+z%#t&/x$k&/x&Et+z&Et&FV$k&FV;'S+z;'S;:j/S;:j?&r$k?&r?Ah+z?Ah?BY$k?BY?Mn+z?Mn~$kX$rUVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$kP%ZRVPOv%Uw!^%U!_~%UW%iR{WOr%dsv%dw~%d_%{]VP{WyUOX$kXY%rYZ%rZ]$k]^%r^p$kpq%rqr$krs%Usv$kw!^$k!^!_%d!_~$kZ&{RzYVPOv%Uw!^%U!_~%U~'XTOp'hqs'hst(Pt!]'h!^~'h~'kTOp'hqs'ht!]'h!]!^'z!^~'h~(POW~~(SROp(]q!](]!^~(]~(`SOp(]q!](]!]!^(l!^~(]~(qOX~Z(xWVP{WOr$krs%Usv$kw}$k}!O)b!O!^$k!^!_%d!_~$kZ)iWVP{WOr$krs%Usv$kw!^$k!^!_%d!_!`$k!`!a*R!a~$kZ*[U|QVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$k]*uWVP{WOr$krs%Usv$kw!^$k!^!_%d!_!`$k!`!a+_!a~$k]+hUdSVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$k_,V}`S^QVP{WOr$krs%Usv$kw}$k}!O+z!O!P+z!P!Q$k!Q![+z![!]+z!]!^$k!^!_%d!_!c$k!c!}+z!}#R$k#R#S+z#S#T$k#T#o+z#o$}$k$}%O+z%O%W$k%W%o+z%o%p$k%p&a+z&a&b$k&b1p+z1p4U+z4U4d+z4d4e$k4e$IS+z$IS$I`$k$I`$Ib+z$Ib$Je$k$Je$Jg+z$Jg$Kh$k$Kh%#t+z%#t&/x$k&/x&Et+z&Et&FV$k&FV;'S+z;'S;:j/S;:j?&r$k?&r?Ah+z?Ah?BY$k?BY?Mn+z?Mn~$k_/ZWVP{WOr$krs%Usv$kw!^$k!^!_%d!_;=`$k;=`<%l+z<%l~$kX/xU{WOq%dqr0[sv%dw!a%d!a!b=X!b~%dX0aZ{WOr%dsv%dw}%d}!O1S!O!f%d!f!g1x!g!}%d!}#O5s#O#W%d#W#X:k#X~%dX1XT{WOr%dsv%dw}%d}!O1h!O~%dX1oR}P{WOr%dsv%dw~%dX1}T{WOr%dsv%dw!q%d!q!r2^!r~%dX2cT{WOr%dsv%dw!e%d!e!f2r!f~%dX2wT{WOr%dsv%dw!v%d!v!w3W!w~%dX3]T{WOr%dsv%dw!{%d!{!|3l!|~%dX3qT{WOr%dsv%dw!r%d!r!s4Q!s~%dX4VT{WOr%dsv%dw!g%d!g!h4f!h~%dX4kV{WOr4frs5Qsv4fvw5Qw!`4f!`!a5c!a~4fP5TRO!`5Q!`!a5^!a~5QP5cOiPX5jRiP{WOr%dsv%dw~%dX5xV{WOr%dsv%dw!e%d!e!f6_!f#V%d#V#W8w#W~%dX6dT{WOr%dsv%dw!f%d!f!g6s!g~%dX6xT{WOr%dsv%dw!c%d!c!d7X!d~%dX7^T{WOr%dsv%dw!v%d!v!w7m!w~%dX7rT{WOr%dsv%dw!c%d!c!d8R!d~%dX8WT{WOr%dsv%dw!}%d!}#O8g#O~%dX8nR{WxPOr%dsv%dw~%dX8|T{WOr%dsv%dw#W%d#W#X9]#X~%dX9bT{WOr%dsv%dw#T%d#T#U9q#U~%dX9vT{WOr%dsv%dw#h%d#h#i:V#i~%dX:[T{WOr%dsv%dw#T%d#T#U8R#U~%dX:pT{WOr%dsv%dw#c%d#c#d;P#d~%dX;UT{WOr%dsv%dw#V%d#V#W;e#W~%dX;jT{WOr%dsv%dw#h%d#h#i;y#i~%dX<OT{WOr%dsv%dw#m%d#m#n<_#n~%dX<dT{WOr%dsv%dw#d%d#d#e<s#e~%dX<xT{WOr%dsv%dw#X%d#X#Y4f#Y~%dX=`R!PP{WOr%dsv%dw~%dZ=rUaQVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$k_>_U[UVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$kZ>xWVP{WOr$krs%Usv$kw!^$k!^!_%d!_!`$k!`!a?b!a~$kZ?kU!OQVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$kZ@UWVP{WOr$krs%Usv$kw!^$k!^!_%d!_#P$k#P#Q@n#Q~$kZ@uWVP{WOr$krs%Usv$kw!^$k!^!_%d!_!`$k!`!aA_!a~$kZAhUwQVP{WOr$krs%Usv$kw!^$k!^!_%d!_~$k",
    tokenizers: [startTag, commentContent2, piContent, cdataContent, 0, 1, 2, 3],
    topRules: {Document: [0, 6]},
    tokenPrec: 0
  });

  // node_modules/@codemirror/lang-xml/dist/index.js
  function tagName(doc2, tag) {
    let name2 = tag && tag.getChild("TagName");
    return name2 ? doc2.sliceString(name2.from, name2.to) : "";
  }
  function elementName3(doc2, tree) {
    let tag = tree && tree.firstChild;
    return !tag || tag.name != "OpenTag" ? "" : tagName(doc2, tag);
  }
  function attrName(doc2, tag, pos) {
    let attr = tag && tag.getChildren("Attribute").find((a) => a.from <= pos && a.to >= pos);
    let name2 = attr && attr.getChild("AttributeName");
    return name2 ? doc2.sliceString(name2.from, name2.to) : "";
  }
  function findParentElement2(tree) {
    for (let cur2 = tree && tree.parent; cur2; cur2 = cur2.parent)
      if (cur2.name == "Element")
        return cur2;
    return null;
  }
  function findLocation(state, pos) {
    var _a2;
    let at = syntaxTree(state).resolveInner(pos, -1), inTag = null;
    for (let cur2 = at; !inTag && cur2.parent; cur2 = cur2.parent)
      if (cur2.name == "OpenTag" || cur2.name == "CloseTag" || cur2.name == "SelfClosingTag" || cur2.name == "MismatchedCloseTag")
        inTag = cur2;
    if (inTag && (inTag.to > pos || inTag.lastChild.type.isError)) {
      let elt2 = inTag.parent;
      if (at.name == "TagName")
        return inTag.name == "CloseTag" || inTag.name == "MismatchedCloseTag" ? {type: "closeTag", from: at.from, context: elt2} : {type: "openTag", from: at.from, context: findParentElement2(elt2)};
      if (at.name == "AttributeName")
        return {type: "attrName", from: at.from, context: inTag};
      if (at.name == "AttributeValue")
        return {type: "attrValue", from: at.from, context: inTag};
      let before = at == inTag || at.name == "Attribute" ? at.childBefore(pos) : at;
      if ((before === null || before === void 0 ? void 0 : before.name) == "StartTag")
        return {type: "openTag", from: pos, context: findParentElement2(elt2)};
      if ((before === null || before === void 0 ? void 0 : before.name) == "StartCloseTag" && before.to <= pos)
        return {type: "closeTag", from: pos, context: elt2};
      if ((before === null || before === void 0 ? void 0 : before.name) == "Is")
        return {type: "attrValue", from: pos, context: inTag};
      if (before)
        return {type: "attrName", from: pos, context: inTag};
      return null;
    } else if (at.name == "StartCloseTag") {
      return {type: "closeTag", from: pos, context: at.parent};
    }
    while (at.parent && at.to == pos && !((_a2 = at.lastChild) === null || _a2 === void 0 ? void 0 : _a2.type.isError))
      at = at.parent;
    if (at.name == "Element" || at.name == "Text" || at.name == "Document")
      return {type: "tag", from: pos, context: at.name == "Element" ? at : findParentElement2(at)};
    return null;
  }
  var Element3 = class {
    constructor(spec, attrs, attrValues) {
      this.attrs = attrs;
      this.attrValues = attrValues;
      this.children = [];
      this.name = spec.name;
      this.completion = Object.assign(Object.assign({type: "type"}, spec.completion || {}), {label: this.name});
      this.openCompletion = Object.assign(Object.assign({}, this.completion), {label: "<" + this.name});
      this.closeCompletion = Object.assign(Object.assign({}, this.completion), {label: "</" + this.name + ">", boost: 2});
      this.closeNameCompletion = Object.assign(Object.assign({}, this.completion), {label: this.name + ">"});
      this.text = spec.textContent ? spec.textContent.map((s) => ({label: s, type: "text"})) : [];
    }
  };
  var Identifier2 = /^[:\-\.\w\u00b7-\uffff]*$/;
  function attrCompletion(spec) {
    return Object.assign(Object.assign({type: "property"}, spec.completion || {}), {label: spec.name});
  }
  function valueCompletion(spec) {
    return typeof spec == "string" ? {label: `"${spec}"`, type: "constant"} : /^"/.test(spec.label) ? spec : Object.assign(Object.assign({}, spec), {label: `"${spec.label}"`});
  }
  function completeFromSchema(eltSpecs, attrSpecs) {
    let allAttrs = [], globalAttrs = [];
    let attrValues = Object.create(null);
    for (let s of attrSpecs) {
      let completion = attrCompletion(s);
      allAttrs.push(completion);
      if (s.global)
        globalAttrs.push(completion);
      if (s.values)
        attrValues[s.name] = s.values.map(valueCompletion);
    }
    let allElements = [], topElements = [];
    let byName = Object.create(null);
    for (let s of eltSpecs) {
      let attrs = globalAttrs, attrVals = attrValues;
      if (s.attributes)
        attrs = attrs.concat(s.attributes.map((s2) => {
          if (typeof s2 == "string")
            return allAttrs.find((a) => a.label == s2) || {label: s2, type: "property"};
          if (s2.values) {
            if (attrVals == attrValues)
              attrVals = Object.create(attrVals);
            attrVals[s2.name] = s2.values.map(valueCompletion);
          }
          return attrCompletion(s2);
        }));
      let elt2 = new Element3(s, attrs, attrVals);
      byName[elt2.name] = elt2;
      allElements.push(elt2);
      if (s.top)
        topElements.push(elt2);
    }
    if (!topElements.length)
      topElements = allElements;
    for (let i = 0; i < allElements.length; i++) {
      let s = eltSpecs[i], elt2 = allElements[i];
      if (s.children) {
        for (let ch of s.children)
          if (byName[ch])
            elt2.children.push(byName[ch]);
      } else {
        elt2.children = allElements;
      }
    }
    return (cx) => {
      var _a2;
      let {doc: doc2} = cx.state, loc = findLocation(cx.state, cx.pos);
      if (!loc || loc.type == "tag" && !cx.explicit)
        return null;
      let {type, from, context} = loc;
      if (type == "openTag") {
        let children = topElements;
        let parentName = elementName3(doc2, context);
        if (parentName) {
          let parent = byName[parentName];
          children = (parent === null || parent === void 0 ? void 0 : parent.children) || allElements;
        }
        return {
          from,
          options: children.map((ch) => ch.completion),
          validFor: Identifier2
        };
      } else if (type == "closeTag") {
        let parentName = elementName3(doc2, context);
        return parentName ? {
          from,
          to: cx.pos + (doc2.sliceString(cx.pos, cx.pos + 1) == ">" ? 1 : 0),
          options: [((_a2 = byName[parentName]) === null || _a2 === void 0 ? void 0 : _a2.closeNameCompletion) || {label: parentName + ">", type: "type"}],
          validFor: Identifier2
        } : null;
      } else if (type == "attrName") {
        let parent = byName[tagName(doc2, context)];
        return {
          from,
          options: (parent === null || parent === void 0 ? void 0 : parent.attrs) || globalAttrs,
          validFor: Identifier2
        };
      } else if (type == "attrValue") {
        let attr = attrName(doc2, context, from);
        if (!attr)
          return null;
        let parent = byName[tagName(doc2, context)];
        let values2 = ((parent === null || parent === void 0 ? void 0 : parent.attrValues) || attrValues)[attr];
        if (!values2 || !values2.length)
          return null;
        return {
          from,
          to: cx.pos + (doc2.sliceString(cx.pos, cx.pos + 1) == '"' ? 1 : 0),
          options: values2,
          validFor: /^"[^"]*"?$/
        };
      } else if (type == "tag") {
        let parentName = elementName3(doc2, context), parent = byName[parentName];
        let closing = [], last = context && context.lastChild;
        if (parentName && (!last || last.name != "CloseTag" || tagName(doc2, last) != parentName))
          closing.push(parent ? parent.closeCompletion : {label: "</" + parentName + ">", type: "type", boost: 2});
        let options = closing.concat(((parent === null || parent === void 0 ? void 0 : parent.children) || (context ? allElements : topElements)).map((e) => e.openCompletion));
        if (context && (parent === null || parent === void 0 ? void 0 : parent.text.length)) {
          let openTag = context.firstChild;
          if (openTag.to > cx.pos - 20 && !/\S/.test(cx.state.sliceDoc(openTag.to, cx.pos)))
            options = options.concat(parent.text);
        }
        return {
          from,
          options,
          validFor: /^<\/?[:\-\.\w\u00b7-\uffff]*$/
        };
      } else {
        return null;
      }
    };
  }
  var xmlLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "xml",
    parser: /* @__PURE__ */ parser5.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          Element(context) {
            let closed = /^\s*<\//.test(context.textAfter);
            return context.lineIndent(context.node.from) + (closed ? 0 : context.unit);
          },
          "OpenTag CloseTag SelfClosingTag"(context) {
            return context.column(context.node.from) + context.unit;
          }
        }),
        /* @__PURE__ */ foldNodeProp.add({
          Element(subtree) {
            let first = subtree.firstChild, last = subtree.lastChild;
            if (!first || first.name != "OpenTag")
              return null;
            return {from: first.to, to: last.name == "CloseTag" ? last.from : subtree.to};
          }
        })
      ]
    }),
    languageData: {
      commentTokens: {block: {open: "<!--", close: "-->"}},
      indentOnInput: /^\s*<\/$/
    }
  });
  function xml(conf = {}) {
    return new LanguageSupport(xmlLanguage, xmlLanguage.data.of({
      autocomplete: completeFromSchema(conf.elements || [], conf.attributes || [])
    }));
  }

  // node_modules/@lezer/markdown/dist/index.js
  var CompositeBlock = class {
    constructor(type, value, from, hash2, end, children, positions) {
      this.type = type;
      this.value = value;
      this.from = from;
      this.hash = hash2;
      this.end = end;
      this.children = children;
      this.positions = positions;
      this.hashProp = [[NodeProp.contextHash, hash2]];
    }
    static create(type, value, from, parentHash, end) {
      let hash2 = parentHash + (parentHash << 8) + type + (value << 4) | 0;
      return new CompositeBlock(type, value, from, hash2, end, [], []);
    }
    addChild(child, pos) {
      if (child.prop(NodeProp.contextHash) != this.hash)
        child = new Tree(child.type, child.children, child.positions, child.length, this.hashProp);
      this.children.push(child);
      this.positions.push(pos);
    }
    toTree(nodeSet, end = this.end) {
      let last = this.children.length - 1;
      if (last >= 0)
        end = Math.max(end, this.positions[last] + this.children[last].length + this.from);
      let tree = new Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
        makeTree: (children, positions, length) => new Tree(NodeType.none, children, positions, length, this.hashProp)
      });
      return tree;
    }
  };
  var Type;
  (function(Type2) {
    Type2[Type2["Document"] = 1] = "Document";
    Type2[Type2["CodeBlock"] = 2] = "CodeBlock";
    Type2[Type2["FencedCode"] = 3] = "FencedCode";
    Type2[Type2["Blockquote"] = 4] = "Blockquote";
    Type2[Type2["HorizontalRule"] = 5] = "HorizontalRule";
    Type2[Type2["BulletList"] = 6] = "BulletList";
    Type2[Type2["OrderedList"] = 7] = "OrderedList";
    Type2[Type2["ListItem"] = 8] = "ListItem";
    Type2[Type2["ATXHeading1"] = 9] = "ATXHeading1";
    Type2[Type2["ATXHeading2"] = 10] = "ATXHeading2";
    Type2[Type2["ATXHeading3"] = 11] = "ATXHeading3";
    Type2[Type2["ATXHeading4"] = 12] = "ATXHeading4";
    Type2[Type2["ATXHeading5"] = 13] = "ATXHeading5";
    Type2[Type2["ATXHeading6"] = 14] = "ATXHeading6";
    Type2[Type2["SetextHeading1"] = 15] = "SetextHeading1";
    Type2[Type2["SetextHeading2"] = 16] = "SetextHeading2";
    Type2[Type2["HTMLBlock"] = 17] = "HTMLBlock";
    Type2[Type2["LinkReference"] = 18] = "LinkReference";
    Type2[Type2["Paragraph"] = 19] = "Paragraph";
    Type2[Type2["CommentBlock"] = 20] = "CommentBlock";
    Type2[Type2["ProcessingInstructionBlock"] = 21] = "ProcessingInstructionBlock";
    Type2[Type2["Escape"] = 22] = "Escape";
    Type2[Type2["Entity"] = 23] = "Entity";
    Type2[Type2["HardBreak"] = 24] = "HardBreak";
    Type2[Type2["Emphasis"] = 25] = "Emphasis";
    Type2[Type2["StrongEmphasis"] = 26] = "StrongEmphasis";
    Type2[Type2["Link"] = 27] = "Link";
    Type2[Type2["Image"] = 28] = "Image";
    Type2[Type2["InlineCode"] = 29] = "InlineCode";
    Type2[Type2["HTMLTag"] = 30] = "HTMLTag";
    Type2[Type2["Comment"] = 31] = "Comment";
    Type2[Type2["ProcessingInstruction"] = 32] = "ProcessingInstruction";
    Type2[Type2["URL"] = 33] = "URL";
    Type2[Type2["HeaderMark"] = 34] = "HeaderMark";
    Type2[Type2["QuoteMark"] = 35] = "QuoteMark";
    Type2[Type2["ListMark"] = 36] = "ListMark";
    Type2[Type2["LinkMark"] = 37] = "LinkMark";
    Type2[Type2["EmphasisMark"] = 38] = "EmphasisMark";
    Type2[Type2["CodeMark"] = 39] = "CodeMark";
    Type2[Type2["CodeText"] = 40] = "CodeText";
    Type2[Type2["CodeInfo"] = 41] = "CodeInfo";
    Type2[Type2["LinkTitle"] = 42] = "LinkTitle";
    Type2[Type2["LinkLabel"] = 43] = "LinkLabel";
  })(Type || (Type = {}));
  var LeafBlock = class {
    constructor(start, content2) {
      this.start = start;
      this.content = content2;
      this.marks = [];
      this.parsers = [];
    }
  };
  var Line2 = class {
    constructor() {
      this.text = "";
      this.baseIndent = 0;
      this.basePos = 0;
      this.depth = 0;
      this.markers = [];
      this.pos = 0;
      this.indent = 0;
      this.next = -1;
    }
    forward() {
      if (this.basePos > this.pos)
        this.forwardInner();
    }
    forwardInner() {
      let newPos = this.skipSpace(this.basePos);
      this.indent = this.countIndent(newPos, this.pos, this.indent);
      this.pos = newPos;
      this.next = newPos == this.text.length ? -1 : this.text.charCodeAt(newPos);
    }
    skipSpace(from) {
      return skipSpace(this.text, from);
    }
    reset(text) {
      this.text = text;
      this.baseIndent = this.basePos = this.pos = this.indent = 0;
      this.forwardInner();
      this.depth = 1;
      while (this.markers.length)
        this.markers.pop();
    }
    moveBase(to) {
      this.basePos = to;
      this.baseIndent = this.countIndent(to, this.pos, this.indent);
    }
    moveBaseColumn(indent) {
      this.baseIndent = indent;
      this.basePos = this.findColumn(indent);
    }
    addMarker(elt2) {
      this.markers.push(elt2);
    }
    countIndent(to, from = 0, indent = 0) {
      for (let i = from; i < to; i++)
        indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1;
      return indent;
    }
    findColumn(goal) {
      let i = 0;
      for (let indent = 0; i < this.text.length && indent < goal; i++)
        indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1;
      return i;
    }
    scrub() {
      if (!this.baseIndent)
        return this.text;
      let result = "";
      for (let i = 0; i < this.basePos; i++)
        result += " ";
      return result + this.text.slice(this.basePos);
    }
  };
  function skipForList(bl, cx, line) {
    if (line.pos == line.text.length || bl != cx.block && line.indent >= cx.stack[line.depth + 1].value + line.baseIndent)
      return true;
    if (line.indent >= line.baseIndent + 4)
      return false;
    let size = (bl.type == Type.OrderedList ? isOrderedList : isBulletList)(line, cx, false);
    return size > 0 && (bl.type != Type.BulletList || isHorizontalRule(line, cx, false) < 0) && line.text.charCodeAt(line.pos + size - 1) == bl.value;
  }
  var DefaultSkipMarkup = {
    [Type.Blockquote](bl, cx, line) {
      if (line.next != 62)
        return false;
      line.markers.push(elt(Type.QuoteMark, cx.lineStart + line.pos, cx.lineStart + line.pos + 1));
      line.moveBase(line.pos + (space3(line.text.charCodeAt(line.pos + 1)) ? 2 : 1));
      bl.end = cx.lineStart + line.text.length;
      return true;
    },
    [Type.ListItem](bl, _cx, line) {
      if (line.indent < line.baseIndent + bl.value && line.next > -1)
        return false;
      line.moveBaseColumn(line.baseIndent + bl.value);
      return true;
    },
    [Type.OrderedList]: skipForList,
    [Type.BulletList]: skipForList,
    [Type.Document]() {
      return true;
    }
  };
  function space3(ch) {
    return ch == 32 || ch == 9 || ch == 10 || ch == 13;
  }
  function skipSpace(line, i = 0) {
    while (i < line.length && space3(line.charCodeAt(i)))
      i++;
    return i;
  }
  function skipSpaceBack(line, i, to) {
    while (i > to && space3(line.charCodeAt(i - 1)))
      i--;
    return i;
  }
  function isFencedCode(line) {
    if (line.next != 96 && line.next != 126)
      return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == line.next)
      pos++;
    if (pos < line.pos + 3)
      return -1;
    if (line.next == 96) {
      for (let i = pos; i < line.text.length; i++)
        if (line.text.charCodeAt(i) == 96)
          return -1;
    }
    return pos;
  }
  function isBlockquote(line) {
    return line.next != 62 ? -1 : line.text.charCodeAt(line.pos + 1) == 32 ? 2 : 1;
  }
  function isHorizontalRule(line, cx, breaking) {
    if (line.next != 42 && line.next != 45 && line.next != 95)
      return -1;
    let count = 1;
    for (let pos = line.pos + 1; pos < line.text.length; pos++) {
      let ch = line.text.charCodeAt(pos);
      if (ch == line.next)
        count++;
      else if (!space3(ch))
        return -1;
    }
    if (breaking && line.next == 45 && isSetextUnderline(line) > -1 && line.depth == cx.stack.length)
      return -1;
    return count < 3 ? -1 : 1;
  }
  function inList(cx, type) {
    for (let i = cx.stack.length - 1; i >= 0; i--)
      if (cx.stack[i].type == type)
        return true;
    return false;
  }
  function isBulletList(line, cx, breaking) {
    return (line.next == 45 || line.next == 43 || line.next == 42) && (line.pos == line.text.length - 1 || space3(line.text.charCodeAt(line.pos + 1))) && (!breaking || inList(cx, Type.BulletList) || line.skipSpace(line.pos + 2) < line.text.length) ? 1 : -1;
  }
  function isOrderedList(line, cx, breaking) {
    let pos = line.pos, next = line.next;
    for (; ; ) {
      if (next >= 48 && next <= 57)
        pos++;
      else
        break;
      if (pos == line.text.length)
        return -1;
      next = line.text.charCodeAt(pos);
    }
    if (pos == line.pos || pos > line.pos + 9 || next != 46 && next != 41 || pos < line.text.length - 1 && !space3(line.text.charCodeAt(pos + 1)) || breaking && !inList(cx, Type.OrderedList) && (line.skipSpace(pos + 1) == line.text.length || pos > line.pos + 1 || line.next != 49))
      return -1;
    return pos + 1 - line.pos;
  }
  function isAtxHeading(line) {
    if (line.next != 35)
      return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 35)
      pos++;
    if (pos < line.text.length && line.text.charCodeAt(pos) != 32)
      return -1;
    let size = pos - line.pos;
    return size > 6 ? -1 : size;
  }
  function isSetextUnderline(line) {
    if (line.next != 45 && line.next != 61 || line.indent >= line.baseIndent + 4)
      return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == line.next)
      pos++;
    let end = pos;
    while (pos < line.text.length && space3(line.text.charCodeAt(pos)))
      pos++;
    return pos == line.text.length ? end : -1;
  }
  var EmptyLine = /^[ \t]*$/;
  var CommentEnd = /-->/;
  var ProcessingEnd = /\?>/;
  var HTMLBlockStyle = [
    [/^<(?:script|pre|style)(?:\s|>|$)/i, /<\/(?:script|pre|style)>/i],
    [/^\s*<!--/, CommentEnd],
    [/^\s*<\?/, ProcessingEnd],
    [/^\s*<![A-Z]/, />/],
    [/^\s*<!\[CDATA\[/, /\]\]>/],
    [/^\s*<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i, EmptyLine],
    [/^\s*(?:<\/[a-z][\w-]*\s*>|<[a-z][\w-]*(\s+[a-z:_][\w-.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*>)\s*$/i, EmptyLine]
  ];
  function isHTMLBlock(line, _cx, breaking) {
    if (line.next != 60)
      return -1;
    let rest = line.text.slice(line.pos);
    for (let i = 0, e = HTMLBlockStyle.length - (breaking ? 1 : 0); i < e; i++)
      if (HTMLBlockStyle[i][0].test(rest))
        return i;
    return -1;
  }
  function getListIndent(line, pos) {
    let indentAfter = line.countIndent(pos, line.pos, line.indent);
    let indented = line.countIndent(line.skipSpace(pos), pos, indentAfter);
    return indented >= indentAfter + 5 ? indentAfter + 1 : indented;
  }
  function addCodeText(marks, from, to) {
    let last = marks.length - 1;
    if (last >= 0 && marks[last].to == from && marks[last].type == Type.CodeText)
      marks[last].to = to;
    else
      marks.push(elt(Type.CodeText, from, to));
  }
  var DefaultBlockParsers = {
    LinkReference: void 0,
    IndentedCode(cx, line) {
      let base2 = line.baseIndent + 4;
      if (line.indent < base2)
        return false;
      let start = line.findColumn(base2);
      let from = cx.lineStart + start, to = cx.lineStart + line.text.length;
      let marks = [], pendingMarks = [];
      addCodeText(marks, from, to);
      while (cx.nextLine() && line.depth >= cx.stack.length) {
        if (line.pos == line.text.length) {
          addCodeText(pendingMarks, cx.lineStart - 1, cx.lineStart);
          for (let m of line.markers)
            pendingMarks.push(m);
        } else if (line.indent < base2) {
          break;
        } else {
          if (pendingMarks.length) {
            for (let m of pendingMarks) {
              if (m.type == Type.CodeText)
                addCodeText(marks, m.from, m.to);
              else
                marks.push(m);
            }
            pendingMarks = [];
          }
          addCodeText(marks, cx.lineStart - 1, cx.lineStart);
          for (let m of line.markers)
            marks.push(m);
          to = cx.lineStart + line.text.length;
          let codeStart = cx.lineStart + line.findColumn(line.baseIndent + 4);
          if (codeStart < to)
            addCodeText(marks, codeStart, to);
        }
      }
      if (pendingMarks.length) {
        pendingMarks = pendingMarks.filter((m) => m.type != Type.CodeText);
        if (pendingMarks.length)
          line.markers = pendingMarks.concat(line.markers);
      }
      cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.CodeBlock, to - from), from);
      return true;
    },
    FencedCode(cx, line) {
      let fenceEnd = isFencedCode(line);
      if (fenceEnd < 0)
        return false;
      let from = cx.lineStart + line.pos, ch = line.next, len = fenceEnd - line.pos;
      let infoFrom = line.skipSpace(fenceEnd), infoTo = skipSpaceBack(line.text, line.text.length, infoFrom);
      let marks = [elt(Type.CodeMark, from, from + len)];
      if (infoFrom < infoTo)
        marks.push(elt(Type.CodeInfo, cx.lineStart + infoFrom, cx.lineStart + infoTo));
      for (let first = true; cx.nextLine() && line.depth >= cx.stack.length; first = false) {
        let i = line.pos;
        if (line.indent - line.baseIndent < 4)
          while (i < line.text.length && line.text.charCodeAt(i) == ch)
            i++;
        if (i - line.pos >= len && line.skipSpace(i) == line.text.length) {
          for (let m of line.markers)
            marks.push(m);
          marks.push(elt(Type.CodeMark, cx.lineStart + line.pos, cx.lineStart + i));
          cx.nextLine();
          break;
        } else {
          if (!first)
            addCodeText(marks, cx.lineStart - 1, cx.lineStart);
          for (let m of line.markers)
            marks.push(m);
          let textStart = cx.lineStart + line.basePos, textEnd = cx.lineStart + line.text.length;
          if (textStart < textEnd)
            addCodeText(marks, textStart, textEnd);
        }
      }
      cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.FencedCode, cx.prevLineEnd() - from), from);
      return true;
    },
    Blockquote(cx, line) {
      let size = isBlockquote(line);
      if (size < 0)
        return false;
      cx.startContext(Type.Blockquote, line.pos);
      cx.addNode(Type.QuoteMark, cx.lineStart + line.pos, cx.lineStart + line.pos + 1);
      line.moveBase(line.pos + size);
      return null;
    },
    HorizontalRule(cx, line) {
      if (isHorizontalRule(line, cx, false) < 0)
        return false;
      let from = cx.lineStart + line.pos;
      cx.nextLine();
      cx.addNode(Type.HorizontalRule, from);
      return true;
    },
    BulletList(cx, line) {
      let size = isBulletList(line, cx, false);
      if (size < 0)
        return false;
      if (cx.block.type != Type.BulletList)
        cx.startContext(Type.BulletList, line.basePos, line.next);
      let newBase = getListIndent(line, line.pos + 1);
      cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
      cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size);
      line.moveBaseColumn(newBase);
      return null;
    },
    OrderedList(cx, line) {
      let size = isOrderedList(line, cx, false);
      if (size < 0)
        return false;
      if (cx.block.type != Type.OrderedList)
        cx.startContext(Type.OrderedList, line.basePos, line.text.charCodeAt(line.pos + size - 1));
      let newBase = getListIndent(line, line.pos + size);
      cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
      cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size);
      line.moveBaseColumn(newBase);
      return null;
    },
    ATXHeading(cx, line) {
      let size = isAtxHeading(line);
      if (size < 0)
        return false;
      let off = line.pos, from = cx.lineStart + off;
      let endOfSpace = skipSpaceBack(line.text, line.text.length, off), after = endOfSpace;
      while (after > off && line.text.charCodeAt(after - 1) == line.next)
        after--;
      if (after == endOfSpace || after == off || !space3(line.text.charCodeAt(after - 1)))
        after = line.text.length;
      let buf = cx.buffer.write(Type.HeaderMark, 0, size).writeElements(cx.parser.parseInline(line.text.slice(off + size + 1, after), from + size + 1), -from);
      if (after < line.text.length)
        buf.write(Type.HeaderMark, after - off, endOfSpace - off);
      let node = buf.finish(Type.ATXHeading1 - 1 + size, line.text.length - off);
      cx.nextLine();
      cx.addNode(node, from);
      return true;
    },
    HTMLBlock(cx, line) {
      let type = isHTMLBlock(line, cx, false);
      if (type < 0)
        return false;
      let from = cx.lineStart + line.pos, end = HTMLBlockStyle[type][1];
      let marks = [], trailing = end != EmptyLine;
      while (!end.test(line.text) && cx.nextLine()) {
        if (line.depth < cx.stack.length) {
          trailing = false;
          break;
        }
        for (let m of line.markers)
          marks.push(m);
      }
      if (trailing)
        cx.nextLine();
      let nodeType = end == CommentEnd ? Type.CommentBlock : end == ProcessingEnd ? Type.ProcessingInstructionBlock : Type.HTMLBlock;
      let to = cx.prevLineEnd();
      cx.addNode(cx.buffer.writeElements(marks, -from).finish(nodeType, to - from), from);
      return true;
    },
    SetextHeading: void 0
  };
  var LinkReferenceParser = class {
    constructor(leaf) {
      this.stage = 0;
      this.elts = [];
      this.pos = 0;
      this.start = leaf.start;
      this.advance(leaf.content);
    }
    nextLine(cx, line, leaf) {
      if (this.stage == -1)
        return false;
      let content2 = leaf.content + "\n" + line.scrub();
      let finish = this.advance(content2);
      if (finish > -1 && finish < content2.length)
        return this.complete(cx, leaf, finish);
      return false;
    }
    finish(cx, leaf) {
      if ((this.stage == 2 || this.stage == 3) && skipSpace(leaf.content, this.pos) == leaf.content.length)
        return this.complete(cx, leaf, leaf.content.length);
      return false;
    }
    complete(cx, leaf, len) {
      cx.addLeafElement(leaf, elt(Type.LinkReference, this.start, this.start + len, this.elts));
      return true;
    }
    nextStage(elt2) {
      if (elt2) {
        this.pos = elt2.to - this.start;
        this.elts.push(elt2);
        this.stage++;
        return true;
      }
      if (elt2 === false)
        this.stage = -1;
      return false;
    }
    advance(content2) {
      for (; ; ) {
        if (this.stage == -1) {
          return -1;
        } else if (this.stage == 0) {
          if (!this.nextStage(parseLinkLabel(content2, this.pos, this.start, true)))
            return -1;
          if (content2.charCodeAt(this.pos) != 58)
            return this.stage = -1;
          this.elts.push(elt(Type.LinkMark, this.pos + this.start, this.pos + this.start + 1));
          this.pos++;
        } else if (this.stage == 1) {
          if (!this.nextStage(parseURL(content2, skipSpace(content2, this.pos), this.start)))
            return -1;
        } else if (this.stage == 2) {
          let skip = skipSpace(content2, this.pos), end = 0;
          if (skip > this.pos) {
            let title = parseLinkTitle(content2, skip, this.start);
            if (title) {
              let titleEnd = lineEnd(content2, title.to - this.start);
              if (titleEnd > 0) {
                this.nextStage(title);
                end = titleEnd;
              }
            }
          }
          if (!end)
            end = lineEnd(content2, this.pos);
          return end > 0 && end < content2.length ? end : -1;
        } else {
          return lineEnd(content2, this.pos);
        }
      }
    }
  };
  function lineEnd(text, pos) {
    for (; pos < text.length; pos++) {
      let next = text.charCodeAt(pos);
      if (next == 10)
        break;
      if (!space3(next))
        return -1;
    }
    return pos;
  }
  var SetextHeadingParser = class {
    nextLine(cx, line, leaf) {
      let underline = line.depth < cx.stack.length ? -1 : isSetextUnderline(line);
      let next = line.next;
      if (underline < 0)
        return false;
      let underlineMark = elt(Type.HeaderMark, cx.lineStart + line.pos, cx.lineStart + underline);
      cx.nextLine();
      cx.addLeafElement(leaf, elt(next == 61 ? Type.SetextHeading1 : Type.SetextHeading2, leaf.start, cx.prevLineEnd(), [
        ...cx.parser.parseInline(leaf.content, leaf.start),
        underlineMark
      ]));
      return true;
    }
    finish() {
      return false;
    }
  };
  var DefaultLeafBlocks = {
    LinkReference(_, leaf) {
      return leaf.content.charCodeAt(0) == 91 ? new LinkReferenceParser(leaf) : null;
    },
    SetextHeading() {
      return new SetextHeadingParser();
    }
  };
  var DefaultEndLeaf = [
    (_, line) => isAtxHeading(line) >= 0,
    (_, line) => isFencedCode(line) >= 0,
    (_, line) => isBlockquote(line) >= 0,
    (p, line) => isBulletList(line, p, true) >= 0,
    (p, line) => isOrderedList(line, p, true) >= 0,
    (p, line) => isHorizontalRule(line, p, true) >= 0,
    (p, line) => isHTMLBlock(line, p, true) >= 0
  ];
  var scanLineResult = {text: "", end: 0};
  var BlockContext = class {
    constructor(parser7, input, fragments, ranges) {
      this.parser = parser7;
      this.input = input;
      this.ranges = ranges;
      this.line = new Line2();
      this.atEnd = false;
      this.dontInject = new Set();
      this.stoppedAt = null;
      this.rangeI = 0;
      this.to = ranges[ranges.length - 1].to;
      this.lineStart = this.absoluteLineStart = this.absoluteLineEnd = ranges[0].from;
      this.block = CompositeBlock.create(Type.Document, 0, this.lineStart, 0, 0);
      this.stack = [this.block];
      this.fragments = fragments.length ? new FragmentCursor3(fragments, input) : null;
      this.readLine();
    }
    get parsedPos() {
      return this.absoluteLineStart;
    }
    advance() {
      if (this.stoppedAt != null && this.absoluteLineStart > this.stoppedAt)
        return this.finish();
      let {line} = this;
      for (; ; ) {
        while (line.depth < this.stack.length)
          this.finishContext();
        for (let mark of line.markers)
          this.addNode(mark.type, mark.from, mark.to);
        if (line.pos < line.text.length)
          break;
        if (!this.nextLine())
          return this.finish();
      }
      if (this.fragments && this.reuseFragment(line.basePos))
        return null;
      start:
        for (; ; ) {
          for (let type of this.parser.blockParsers)
            if (type) {
              let result = type(this, line);
              if (result != false) {
                if (result == true)
                  return null;
                line.forward();
                continue start;
              }
            }
          break;
        }
      let leaf = new LeafBlock(this.lineStart + line.pos, line.text.slice(line.pos));
      for (let parse of this.parser.leafBlockParsers)
        if (parse) {
          let parser7 = parse(this, leaf);
          if (parser7)
            leaf.parsers.push(parser7);
        }
      lines:
        while (this.nextLine()) {
          if (line.pos == line.text.length)
            break;
          if (line.indent < line.baseIndent + 4) {
            for (let stop of this.parser.endLeafBlock)
              if (stop(this, line, leaf))
                break lines;
          }
          for (let parser7 of leaf.parsers)
            if (parser7.nextLine(this, line, leaf))
              return null;
          leaf.content += "\n" + line.scrub();
          for (let m of line.markers)
            leaf.marks.push(m);
        }
      this.finishLeaf(leaf);
      return null;
    }
    stopAt(pos) {
      if (this.stoppedAt != null && this.stoppedAt < pos)
        throw new RangeError("Can't move stoppedAt forward");
      this.stoppedAt = pos;
    }
    reuseFragment(start) {
      if (!this.fragments.moveTo(this.absoluteLineStart + start, this.absoluteLineStart) || !this.fragments.matches(this.block.hash))
        return false;
      let taken = this.fragments.takeNodes(this);
      if (!taken)
        return false;
      let withoutGaps = taken, end = this.absoluteLineStart + taken;
      for (let i = 1; i < this.ranges.length; i++) {
        let gapFrom = this.ranges[i - 1].to, gapTo = this.ranges[i].from;
        if (gapFrom >= this.lineStart && gapTo < end)
          withoutGaps -= gapTo - gapFrom;
      }
      this.lineStart += withoutGaps;
      this.absoluteLineStart += taken;
      this.moveRangeI();
      if (this.absoluteLineStart < this.to) {
        this.lineStart++;
        this.absoluteLineStart++;
        this.readLine();
      } else {
        this.atEnd = true;
        this.readLine();
      }
      return true;
    }
    get depth() {
      return this.stack.length;
    }
    parentType(depth = this.depth - 1) {
      return this.parser.nodeSet.types[this.stack[depth].type];
    }
    nextLine() {
      this.lineStart += this.line.text.length;
      if (this.absoluteLineEnd >= this.to) {
        this.absoluteLineStart = this.absoluteLineEnd;
        this.atEnd = true;
        this.readLine();
        return false;
      } else {
        this.lineStart++;
        this.absoluteLineStart = this.absoluteLineEnd + 1;
        this.moveRangeI();
        this.readLine();
        return true;
      }
    }
    moveRangeI() {
      while (this.rangeI < this.ranges.length - 1 && this.absoluteLineStart >= this.ranges[this.rangeI].to) {
        this.rangeI++;
        this.absoluteLineStart = Math.max(this.absoluteLineStart, this.ranges[this.rangeI].from);
      }
    }
    scanLine(start) {
      let r = scanLineResult;
      r.end = start;
      if (start >= this.to) {
        r.text = "";
      } else {
        r.text = this.lineChunkAt(start);
        r.end += r.text.length;
        if (this.ranges.length > 1) {
          let textOffset = this.absoluteLineStart, rangeI = this.rangeI;
          while (this.ranges[rangeI].to < r.end) {
            rangeI++;
            let nextFrom = this.ranges[rangeI].from;
            let after = this.lineChunkAt(nextFrom);
            r.end = nextFrom + after.length;
            r.text = r.text.slice(0, this.ranges[rangeI - 1].to - textOffset) + after;
            textOffset = r.end - r.text.length;
          }
        }
      }
      return r;
    }
    readLine() {
      let {line} = this, {text, end} = this.scanLine(this.absoluteLineStart);
      this.absoluteLineEnd = end;
      line.reset(text);
      for (; line.depth < this.stack.length; line.depth++) {
        let cx = this.stack[line.depth], handler = this.parser.skipContextMarkup[cx.type];
        if (!handler)
          throw new Error("Unhandled block context " + Type[cx.type]);
        if (!handler(cx, this, line))
          break;
        line.forward();
      }
    }
    lineChunkAt(pos) {
      let next = this.input.chunk(pos), text;
      if (!this.input.lineChunks) {
        let eol = next.indexOf("\n");
        text = eol < 0 ? next : next.slice(0, eol);
      } else {
        text = next == "\n" ? "" : next;
      }
      return pos + text.length > this.to ? text.slice(0, this.to - pos) : text;
    }
    prevLineEnd() {
      return this.atEnd ? this.lineStart : this.lineStart - 1;
    }
    startContext(type, start, value = 0) {
      this.block = CompositeBlock.create(type, value, this.lineStart + start, this.block.hash, this.lineStart + this.line.text.length);
      this.stack.push(this.block);
    }
    startComposite(type, start, value = 0) {
      this.startContext(this.parser.getNodeType(type), start, value);
    }
    addNode(block, from, to) {
      if (typeof block == "number")
        block = new Tree(this.parser.nodeSet.types[block], none4, none4, (to !== null && to !== void 0 ? to : this.prevLineEnd()) - from);
      this.block.addChild(block, from - this.block.from);
    }
    addElement(elt2) {
      this.block.addChild(elt2.toTree(this.parser.nodeSet), elt2.from - this.block.from);
    }
    addLeafElement(leaf, elt2) {
      this.addNode(this.buffer.writeElements(injectMarks(elt2.children, leaf.marks), -elt2.from).finish(elt2.type, elt2.to - elt2.from), elt2.from);
    }
    finishContext() {
      let cx = this.stack.pop();
      let top2 = this.stack[this.stack.length - 1];
      top2.addChild(cx.toTree(this.parser.nodeSet), cx.from - top2.from);
      this.block = top2;
    }
    finish() {
      while (this.stack.length > 1)
        this.finishContext();
      return this.addGaps(this.block.toTree(this.parser.nodeSet, this.lineStart));
    }
    addGaps(tree) {
      return this.ranges.length > 1 ? injectGaps(this.ranges, 0, tree.topNode, this.ranges[0].from, this.dontInject) : tree;
    }
    finishLeaf(leaf) {
      for (let parser7 of leaf.parsers)
        if (parser7.finish(this, leaf))
          return;
      let inline = injectMarks(this.parser.parseInline(leaf.content, leaf.start), leaf.marks);
      this.addNode(this.buffer.writeElements(inline, -leaf.start).finish(Type.Paragraph, leaf.content.length), leaf.start);
    }
    elt(type, from, to, children) {
      if (typeof type == "string")
        return elt(this.parser.getNodeType(type), from, to, children);
      return new TreeElement(type, from);
    }
    get buffer() {
      return new Buffer(this.parser.nodeSet);
    }
  };
  function injectGaps(ranges, rangeI, tree, offset, dont) {
    if (dont.has(tree.tree))
      return tree.tree;
    let rangeEnd = ranges[rangeI].to;
    let children = [], positions = [], start = tree.from + offset;
    function movePastNext(upto, inclusive) {
      while (inclusive ? upto >= rangeEnd : upto > rangeEnd) {
        let size = ranges[rangeI + 1].from - rangeEnd;
        offset += size;
        upto += size;
        rangeI++;
        rangeEnd = ranges[rangeI].to;
      }
    }
    for (let ch = tree.firstChild; ch; ch = ch.nextSibling) {
      movePastNext(ch.from + offset, true);
      let from = ch.from + offset, node;
      if (ch.to + offset > rangeEnd) {
        node = injectGaps(ranges, rangeI, ch, offset, dont);
        movePastNext(ch.to + offset, false);
      } else {
        node = ch.toTree();
      }
      children.push(node);
      positions.push(from - start);
    }
    movePastNext(tree.to + offset, false);
    return new Tree(tree.type, children, positions, tree.to + offset - start, tree.tree ? tree.tree.propValues : void 0);
  }
  var MarkdownParser = class extends Parser {
    constructor(nodeSet, blockParsers, leafBlockParsers, blockNames, endLeafBlock, skipContextMarkup, inlineParsers, inlineNames, wrappers) {
      super();
      this.nodeSet = nodeSet;
      this.blockParsers = blockParsers;
      this.leafBlockParsers = leafBlockParsers;
      this.blockNames = blockNames;
      this.endLeafBlock = endLeafBlock;
      this.skipContextMarkup = skipContextMarkup;
      this.inlineParsers = inlineParsers;
      this.inlineNames = inlineNames;
      this.wrappers = wrappers;
      this.nodeTypes = Object.create(null);
      for (let t2 of nodeSet.types)
        this.nodeTypes[t2.name] = t2.id;
    }
    createParse(input, fragments, ranges) {
      let parse = new BlockContext(this, input, fragments, ranges);
      for (let w of this.wrappers)
        parse = w(parse, input, fragments, ranges);
      return parse;
    }
    configure(spec) {
      let config = resolveConfig(spec);
      if (!config)
        return this;
      let {nodeSet, skipContextMarkup} = this;
      let blockParsers = this.blockParsers.slice(), leafBlockParsers = this.leafBlockParsers.slice(), blockNames = this.blockNames.slice(), inlineParsers = this.inlineParsers.slice(), inlineNames = this.inlineNames.slice(), endLeafBlock = this.endLeafBlock.slice(), wrappers = this.wrappers;
      if (nonEmpty(config.defineNodes)) {
        skipContextMarkup = Object.assign({}, skipContextMarkup);
        let nodeTypes2 = nodeSet.types.slice(), styles;
        for (let s of config.defineNodes) {
          let {name: name2, block, composite, style} = typeof s == "string" ? {name: s} : s;
          if (nodeTypes2.some((t2) => t2.name == name2))
            continue;
          if (composite)
            skipContextMarkup[nodeTypes2.length] = (bl, cx, line) => composite(cx, line, bl.value);
          let id2 = nodeTypes2.length;
          let group = composite ? ["Block", "BlockContext"] : !block ? void 0 : id2 >= Type.ATXHeading1 && id2 <= Type.SetextHeading2 ? ["Block", "LeafBlock", "Heading"] : ["Block", "LeafBlock"];
          nodeTypes2.push(NodeType.define({
            id: id2,
            name: name2,
            props: group && [[NodeProp.group, group]]
          }));
          if (style) {
            if (!styles)
              styles = {};
            if (Array.isArray(style) || style instanceof Tag)
              styles[name2] = style;
            else
              Object.assign(styles, style);
          }
        }
        nodeSet = new NodeSet(nodeTypes2);
        if (styles)
          nodeSet = nodeSet.extend(styleTags(styles));
      }
      if (nonEmpty(config.props))
        nodeSet = nodeSet.extend(...config.props);
      if (nonEmpty(config.remove)) {
        for (let rm of config.remove) {
          let block = this.blockNames.indexOf(rm), inline = this.inlineNames.indexOf(rm);
          if (block > -1)
            blockParsers[block] = leafBlockParsers[block] = void 0;
          if (inline > -1)
            inlineParsers[inline] = void 0;
        }
      }
      if (nonEmpty(config.parseBlock)) {
        for (let spec2 of config.parseBlock) {
          let found = blockNames.indexOf(spec2.name);
          if (found > -1) {
            blockParsers[found] = spec2.parse;
            leafBlockParsers[found] = spec2.leaf;
          } else {
            let pos = spec2.before ? findName(blockNames, spec2.before) : spec2.after ? findName(blockNames, spec2.after) + 1 : blockNames.length - 1;
            blockParsers.splice(pos, 0, spec2.parse);
            leafBlockParsers.splice(pos, 0, spec2.leaf);
            blockNames.splice(pos, 0, spec2.name);
          }
          if (spec2.endLeaf)
            endLeafBlock.push(spec2.endLeaf);
        }
      }
      if (nonEmpty(config.parseInline)) {
        for (let spec2 of config.parseInline) {
          let found = inlineNames.indexOf(spec2.name);
          if (found > -1) {
            inlineParsers[found] = spec2.parse;
          } else {
            let pos = spec2.before ? findName(inlineNames, spec2.before) : spec2.after ? findName(inlineNames, spec2.after) + 1 : inlineNames.length - 1;
            inlineParsers.splice(pos, 0, spec2.parse);
            inlineNames.splice(pos, 0, spec2.name);
          }
        }
      }
      if (config.wrap)
        wrappers = wrappers.concat(config.wrap);
      return new MarkdownParser(nodeSet, blockParsers, leafBlockParsers, blockNames, endLeafBlock, skipContextMarkup, inlineParsers, inlineNames, wrappers);
    }
    getNodeType(name2) {
      let found = this.nodeTypes[name2];
      if (found == null)
        throw new RangeError(`Unknown node type '${name2}'`);
      return found;
    }
    parseInline(text, offset) {
      let cx = new InlineContext(this, text, offset);
      outer:
        for (let pos = offset; pos < cx.end; ) {
          let next = cx.char(pos);
          for (let token of this.inlineParsers)
            if (token) {
              let result = token(cx, next, pos);
              if (result >= 0) {
                pos = result;
                continue outer;
              }
            }
          pos++;
        }
      return cx.resolveMarkers(0);
    }
  };
  function nonEmpty(a) {
    return a != null && a.length > 0;
  }
  function resolveConfig(spec) {
    if (!Array.isArray(spec))
      return spec;
    if (spec.length == 0)
      return null;
    let conf = resolveConfig(spec[0]);
    if (spec.length == 1)
      return conf;
    let rest = resolveConfig(spec.slice(1));
    if (!rest || !conf)
      return conf || rest;
    let conc2 = (a, b) => (a || none4).concat(b || none4);
    let wrapA = conf.wrap, wrapB = rest.wrap;
    return {
      props: conc2(conf.props, rest.props),
      defineNodes: conc2(conf.defineNodes, rest.defineNodes),
      parseBlock: conc2(conf.parseBlock, rest.parseBlock),
      parseInline: conc2(conf.parseInline, rest.parseInline),
      remove: conc2(conf.remove, rest.remove),
      wrap: !wrapA ? wrapB : !wrapB ? wrapA : (inner, input, fragments, ranges) => wrapA(wrapB(inner, input, fragments, ranges), input, fragments, ranges)
    };
  }
  function findName(names, name2) {
    let found = names.indexOf(name2);
    if (found < 0)
      throw new RangeError(`Position specified relative to unknown parser ${name2}`);
    return found;
  }
  var nodeTypes = [NodeType.none];
  for (let i = 1, name2; name2 = Type[i]; i++) {
    nodeTypes[i] = NodeType.define({
      id: i,
      name: name2,
      props: i >= Type.Escape ? [] : [[NodeProp.group, i in DefaultSkipMarkup ? ["Block", "BlockContext"] : ["Block", "LeafBlock"]]]
    });
  }
  var none4 = [];
  var Buffer = class {
    constructor(nodeSet) {
      this.nodeSet = nodeSet;
      this.content = [];
      this.nodes = [];
    }
    write(type, from, to, children = 0) {
      this.content.push(type, from, to, 4 + children * 4);
      return this;
    }
    writeElements(elts, offset = 0) {
      for (let e of elts)
        e.writeTo(this, offset);
      return this;
    }
    finish(type, length) {
      return Tree.build({
        buffer: this.content,
        nodeSet: this.nodeSet,
        reused: this.nodes,
        topID: type,
        length
      });
    }
  };
  var Element4 = class {
    constructor(type, from, to, children = none4) {
      this.type = type;
      this.from = from;
      this.to = to;
      this.children = children;
    }
    writeTo(buf, offset) {
      let startOff = buf.content.length;
      buf.writeElements(this.children, offset);
      buf.content.push(this.type, this.from + offset, this.to + offset, buf.content.length + 4 - startOff);
    }
    toTree(nodeSet) {
      return new Buffer(nodeSet).writeElements(this.children, -this.from).finish(this.type, this.to - this.from);
    }
  };
  var TreeElement = class {
    constructor(tree, from) {
      this.tree = tree;
      this.from = from;
    }
    get to() {
      return this.from + this.tree.length;
    }
    get type() {
      return this.tree.type.id;
    }
    get children() {
      return none4;
    }
    writeTo(buf, offset) {
      buf.nodes.push(this.tree);
      buf.content.push(buf.nodes.length - 1, this.from + offset, this.to + offset, -1);
    }
    toTree() {
      return this.tree;
    }
  };
  function elt(type, from, to, children) {
    return new Element4(type, from, to, children);
  }
  var EmphasisUnderscore = {resolve: "Emphasis", mark: "EmphasisMark"};
  var EmphasisAsterisk = {resolve: "Emphasis", mark: "EmphasisMark"};
  var LinkStart = {};
  var ImageStart = {};
  var InlineDelimiter = class {
    constructor(type, from, to, side) {
      this.type = type;
      this.from = from;
      this.to = to;
      this.side = side;
    }
  };
  var Escapable = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  var Punctuation = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1\u2010-\u2027]/;
  try {
    Punctuation = new RegExp("[\\p{Pc}|\\p{Pd}|\\p{Pe}|\\p{Pf}|\\p{Pi}|\\p{Po}|\\p{Ps}]", "u");
  } catch (_) {
  }
  var DefaultInline = {
    Escape(cx, next, start) {
      if (next != 92 || start == cx.end - 1)
        return -1;
      let escaped = cx.char(start + 1);
      for (let i = 0; i < Escapable.length; i++)
        if (Escapable.charCodeAt(i) == escaped)
          return cx.append(elt(Type.Escape, start, start + 2));
      return -1;
    },
    Entity(cx, next, start) {
      if (next != 38)
        return -1;
      let m = /^(?:#\d+|#x[a-f\d]+|\w+);/i.exec(cx.slice(start + 1, start + 31));
      return m ? cx.append(elt(Type.Entity, start, start + 1 + m[0].length)) : -1;
    },
    InlineCode(cx, next, start) {
      if (next != 96 || start && cx.char(start - 1) == 96)
        return -1;
      let pos = start + 1;
      while (pos < cx.end && cx.char(pos) == 96)
        pos++;
      let size = pos - start, curSize = 0;
      for (; pos < cx.end; pos++) {
        if (cx.char(pos) == 96) {
          curSize++;
          if (curSize == size && cx.char(pos + 1) != 96)
            return cx.append(elt(Type.InlineCode, start, pos + 1, [
              elt(Type.CodeMark, start, start + size),
              elt(Type.CodeMark, pos + 1 - size, pos + 1)
            ]));
        } else {
          curSize = 0;
        }
      }
      return -1;
    },
    HTMLTag(cx, next, start) {
      if (next != 60 || start == cx.end - 1)
        return -1;
      let after = cx.slice(start + 1, cx.end);
      let url = /^(?:[a-z][-\w+.]+:[^\s>]+|[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*)>/i.exec(after);
      if (url)
        return cx.append(elt(Type.URL, start, start + 1 + url[0].length));
      let comment2 = /^!--[^>](?:-[^-]|[^-])*?-->/i.exec(after);
      if (comment2)
        return cx.append(elt(Type.Comment, start, start + 1 + comment2[0].length));
      let procInst = /^\?[^]*?\?>/.exec(after);
      if (procInst)
        return cx.append(elt(Type.ProcessingInstruction, start, start + 1 + procInst[0].length));
      let m = /^(?:![A-Z][^]*?>|!\[CDATA\[[^]*?\]\]>|\/\s*[a-zA-Z][\w-]*\s*>|\s*[a-zA-Z][\w-]*(\s+[a-zA-Z:_][\w-.:]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*(\/\s*)?>)/.exec(after);
      if (!m)
        return -1;
      return cx.append(elt(Type.HTMLTag, start, start + 1 + m[0].length));
    },
    Emphasis(cx, next, start) {
      if (next != 95 && next != 42)
        return -1;
      let pos = start + 1;
      while (cx.char(pos) == next)
        pos++;
      let before = cx.slice(start - 1, start), after = cx.slice(pos, pos + 1);
      let pBefore = Punctuation.test(before), pAfter = Punctuation.test(after);
      let sBefore = /\s|^$/.test(before), sAfter = /\s|^$/.test(after);
      let leftFlanking = !sAfter && (!pAfter || sBefore || pBefore);
      let rightFlanking = !sBefore && (!pBefore || sAfter || pAfter);
      let canOpen = leftFlanking && (next == 42 || !rightFlanking || pBefore);
      let canClose = rightFlanking && (next == 42 || !leftFlanking || pAfter);
      return cx.append(new InlineDelimiter(next == 95 ? EmphasisUnderscore : EmphasisAsterisk, start, pos, (canOpen ? 1 : 0) | (canClose ? 2 : 0)));
    },
    HardBreak(cx, next, start) {
      if (next == 92 && cx.char(start + 1) == 10)
        return cx.append(elt(Type.HardBreak, start, start + 2));
      if (next == 32) {
        let pos = start + 1;
        while (cx.char(pos) == 32)
          pos++;
        if (cx.char(pos) == 10 && pos >= start + 2)
          return cx.append(elt(Type.HardBreak, start, pos + 1));
      }
      return -1;
    },
    Link(cx, next, start) {
      return next == 91 ? cx.append(new InlineDelimiter(LinkStart, start, start + 1, 1)) : -1;
    },
    Image(cx, next, start) {
      return next == 33 && cx.char(start + 1) == 91 ? cx.append(new InlineDelimiter(ImageStart, start, start + 2, 1)) : -1;
    },
    LinkEnd(cx, next, start) {
      if (next != 93)
        return -1;
      for (let i = cx.parts.length - 1; i >= 0; i--) {
        let part = cx.parts[i];
        if (part instanceof InlineDelimiter && (part.type == LinkStart || part.type == ImageStart)) {
          if (!part.side || cx.skipSpace(part.to) == start && !/[(\[]/.test(cx.slice(start + 1, start + 2))) {
            cx.parts[i] = null;
            return -1;
          }
          let content2 = cx.takeContent(i);
          let link = cx.parts[i] = finishLink(cx, content2, part.type == LinkStart ? Type.Link : Type.Image, part.from, start + 1);
          if (part.type == LinkStart)
            for (let j = 0; j < i; j++) {
              let p = cx.parts[j];
              if (p instanceof InlineDelimiter && p.type == LinkStart)
                p.side = 0;
            }
          return link.to;
        }
      }
      return -1;
    }
  };
  function finishLink(cx, content2, type, start, startPos) {
    let {text} = cx, next = cx.char(startPos), endPos = startPos;
    content2.unshift(elt(Type.LinkMark, start, start + (type == Type.Image ? 2 : 1)));
    content2.push(elt(Type.LinkMark, startPos - 1, startPos));
    if (next == 40) {
      let pos = cx.skipSpace(startPos + 1);
      let dest = parseURL(text, pos - cx.offset, cx.offset), title;
      if (dest) {
        pos = cx.skipSpace(dest.to);
        title = parseLinkTitle(text, pos - cx.offset, cx.offset);
        if (title)
          pos = cx.skipSpace(title.to);
      }
      if (cx.char(pos) == 41) {
        content2.push(elt(Type.LinkMark, startPos, startPos + 1));
        endPos = pos + 1;
        if (dest)
          content2.push(dest);
        if (title)
          content2.push(title);
        content2.push(elt(Type.LinkMark, pos, endPos));
      }
    } else if (next == 91) {
      let label = parseLinkLabel(text, startPos - cx.offset, cx.offset, false);
      if (label) {
        content2.push(label);
        endPos = label.to;
      }
    }
    return elt(type, start, endPos, content2);
  }
  function parseURL(text, start, offset) {
    let next = text.charCodeAt(start);
    if (next == 60) {
      for (let pos = start + 1; pos < text.length; pos++) {
        let ch = text.charCodeAt(pos);
        if (ch == 62)
          return elt(Type.URL, start + offset, pos + 1 + offset);
        if (ch == 60 || ch == 10)
          return false;
      }
      return null;
    } else {
      let depth = 0, pos = start;
      for (let escaped = false; pos < text.length; pos++) {
        let ch = text.charCodeAt(pos);
        if (space3(ch)) {
          break;
        } else if (escaped) {
          escaped = false;
        } else if (ch == 40) {
          depth++;
        } else if (ch == 41) {
          if (!depth)
            break;
          depth--;
        } else if (ch == 92) {
          escaped = true;
        }
      }
      return pos > start ? elt(Type.URL, start + offset, pos + offset) : pos == text.length ? null : false;
    }
  }
  function parseLinkTitle(text, start, offset) {
    let next = text.charCodeAt(start);
    if (next != 39 && next != 34 && next != 40)
      return false;
    let end = next == 40 ? 41 : next;
    for (let pos = start + 1, escaped = false; pos < text.length; pos++) {
      let ch = text.charCodeAt(pos);
      if (escaped)
        escaped = false;
      else if (ch == end)
        return elt(Type.LinkTitle, start + offset, pos + 1 + offset);
      else if (ch == 92)
        escaped = true;
    }
    return null;
  }
  function parseLinkLabel(text, start, offset, requireNonWS) {
    for (let escaped = false, pos = start + 1, end = Math.min(text.length, pos + 999); pos < end; pos++) {
      let ch = text.charCodeAt(pos);
      if (escaped)
        escaped = false;
      else if (ch == 93)
        return requireNonWS ? false : elt(Type.LinkLabel, start + offset, pos + 1 + offset);
      else {
        if (requireNonWS && !space3(ch))
          requireNonWS = false;
        if (ch == 91)
          return false;
        else if (ch == 92)
          escaped = true;
      }
    }
    return null;
  }
  var InlineContext = class {
    constructor(parser7, text, offset) {
      this.parser = parser7;
      this.text = text;
      this.offset = offset;
      this.parts = [];
    }
    char(pos) {
      return pos >= this.end ? -1 : this.text.charCodeAt(pos - this.offset);
    }
    get end() {
      return this.offset + this.text.length;
    }
    slice(from, to) {
      return this.text.slice(from - this.offset, to - this.offset);
    }
    append(elt2) {
      this.parts.push(elt2);
      return elt2.to;
    }
    addDelimiter(type, from, to, open, close) {
      return this.append(new InlineDelimiter(type, from, to, (open ? 1 : 0) | (close ? 2 : 0)));
    }
    addElement(elt2) {
      return this.append(elt2);
    }
    resolveMarkers(from) {
      for (let i = from; i < this.parts.length; i++) {
        let close = this.parts[i];
        if (!(close instanceof InlineDelimiter && close.type.resolve && close.side & 2))
          continue;
        let emp = close.type == EmphasisUnderscore || close.type == EmphasisAsterisk;
        let closeSize = close.to - close.from;
        let open, j = i - 1;
        for (; j >= from; j--) {
          let part = this.parts[j];
          if (part instanceof InlineDelimiter && part.side & 1 && part.type == close.type && !(emp && (close.side & 1 || part.side & 2) && (part.to - part.from + closeSize) % 3 == 0 && ((part.to - part.from) % 3 || closeSize % 3))) {
            open = part;
            break;
          }
        }
        if (!open)
          continue;
        let type = close.type.resolve, content2 = [];
        let start = open.from, end = close.to;
        if (emp) {
          let size = Math.min(2, open.to - open.from, closeSize);
          start = open.to - size;
          end = close.from + size;
          type = size == 1 ? "Emphasis" : "StrongEmphasis";
        }
        if (open.type.mark)
          content2.push(this.elt(open.type.mark, start, open.to));
        for (let k = j + 1; k < i; k++) {
          if (this.parts[k] instanceof Element4)
            content2.push(this.parts[k]);
          this.parts[k] = null;
        }
        if (close.type.mark)
          content2.push(this.elt(close.type.mark, close.from, end));
        let element = this.elt(type, start, end, content2);
        this.parts[j] = emp && open.from != start ? new InlineDelimiter(open.type, open.from, start, open.side) : null;
        let keep = this.parts[i] = emp && close.to != end ? new InlineDelimiter(close.type, end, close.to, close.side) : null;
        if (keep)
          this.parts.splice(i, 0, element);
        else
          this.parts[i] = element;
      }
      let result = [];
      for (let i = from; i < this.parts.length; i++) {
        let part = this.parts[i];
        if (part instanceof Element4)
          result.push(part);
      }
      return result;
    }
    findOpeningDelimiter(type) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        let part = this.parts[i];
        if (part instanceof InlineDelimiter && part.type == type)
          return i;
      }
      return null;
    }
    takeContent(startIndex) {
      let content2 = this.resolveMarkers(startIndex);
      this.parts.length = startIndex;
      return content2;
    }
    skipSpace(from) {
      return skipSpace(this.text, from - this.offset) + this.offset;
    }
    elt(type, from, to, children) {
      if (typeof type == "string")
        return elt(this.parser.getNodeType(type), from, to, children);
      return new TreeElement(type, from);
    }
  };
  function injectMarks(elements, marks) {
    if (!marks.length)
      return elements;
    if (!elements.length)
      return marks;
    let elts = elements.slice(), eI = 0;
    for (let mark of marks) {
      while (eI < elts.length && elts[eI].to < mark.to)
        eI++;
      if (eI < elts.length && elts[eI].from < mark.from) {
        let e = elts[eI];
        if (e instanceof Element4)
          elts[eI] = new Element4(e.type, e.from, e.to, injectMarks(e.children, [mark]));
      } else {
        elts.splice(eI++, 0, mark);
      }
    }
    return elts;
  }
  var NotLast = [Type.CodeBlock, Type.ListItem, Type.OrderedList, Type.BulletList];
  var FragmentCursor3 = class {
    constructor(fragments, input) {
      this.fragments = fragments;
      this.input = input;
      this.i = 0;
      this.fragment = null;
      this.fragmentEnd = -1;
      this.cursor = null;
      if (fragments.length)
        this.fragment = fragments[this.i++];
    }
    nextFragment() {
      this.fragment = this.i < this.fragments.length ? this.fragments[this.i++] : null;
      this.cursor = null;
      this.fragmentEnd = -1;
    }
    moveTo(pos, lineStart) {
      while (this.fragment && this.fragment.to <= pos)
        this.nextFragment();
      if (!this.fragment || this.fragment.from > (pos ? pos - 1 : 0))
        return false;
      if (this.fragmentEnd < 0) {
        let end = this.fragment.to;
        while (end > 0 && this.input.read(end - 1, end) != "\n")
          end--;
        this.fragmentEnd = end ? end - 1 : 0;
      }
      let c = this.cursor;
      if (!c) {
        c = this.cursor = this.fragment.tree.cursor();
        c.firstChild();
      }
      let rPos = pos + this.fragment.offset;
      while (c.to <= rPos)
        if (!c.parent())
          return false;
      for (; ; ) {
        if (c.from >= rPos)
          return this.fragment.from <= lineStart;
        if (!c.childAfter(rPos))
          return false;
      }
    }
    matches(hash2) {
      let tree = this.cursor.tree;
      return tree && tree.prop(NodeProp.contextHash) == hash2;
    }
    takeNodes(cx) {
      let cur2 = this.cursor, off = this.fragment.offset, fragEnd = this.fragmentEnd - (this.fragment.openEnd ? 1 : 0);
      let start = cx.absoluteLineStart, end = start, blockI = cx.block.children.length;
      let prevEnd = end, prevI = blockI;
      for (; ; ) {
        if (cur2.to - off > fragEnd) {
          if (cur2.type.isAnonymous && cur2.firstChild())
            continue;
          break;
        }
        cx.dontInject.add(cur2.tree);
        cx.addNode(cur2.tree, cur2.from - off);
        if (cur2.type.is("Block")) {
          if (NotLast.indexOf(cur2.type.id) < 0) {
            end = cur2.to - off;
            blockI = cx.block.children.length;
          } else {
            end = prevEnd;
            blockI = prevI;
            prevEnd = cur2.to - off;
            prevI = cx.block.children.length;
          }
        }
        if (!cur2.nextSibling())
          break;
      }
      while (cx.block.children.length > blockI) {
        cx.block.children.pop();
        cx.block.positions.pop();
      }
      return end - start;
    }
  };
  var markdownHighlighting = styleTags({
    "Blockquote/...": tags.quote,
    HorizontalRule: tags.contentSeparator,
    "ATXHeading1/... SetextHeading1/...": tags.heading1,
    "ATXHeading2/... SetextHeading2/...": tags.heading2,
    "ATXHeading3/...": tags.heading3,
    "ATXHeading4/...": tags.heading4,
    "ATXHeading5/...": tags.heading5,
    "ATXHeading6/...": tags.heading6,
    "Comment CommentBlock": tags.comment,
    Escape: tags.escape,
    Entity: tags.character,
    "Emphasis/...": tags.emphasis,
    "StrongEmphasis/...": tags.strong,
    "Link/... Image/...": tags.link,
    "OrderedList/... BulletList/...": tags.list,
    "BlockQuote/...": tags.quote,
    "InlineCode CodeText": tags.monospace,
    URL: tags.url,
    "HeaderMark HardBreak QuoteMark ListMark LinkMark EmphasisMark CodeMark": tags.processingInstruction,
    "CodeInfo LinkLabel": tags.labelName,
    LinkTitle: tags.string,
    Paragraph: tags.content
  });
  var parser6 = new MarkdownParser(new NodeSet(nodeTypes).extend(markdownHighlighting), Object.keys(DefaultBlockParsers).map((n) => DefaultBlockParsers[n]), Object.keys(DefaultBlockParsers).map((n) => DefaultLeafBlocks[n]), Object.keys(DefaultBlockParsers), DefaultEndLeaf, DefaultSkipMarkup, Object.keys(DefaultInline).map((n) => DefaultInline[n]), Object.keys(DefaultInline), []);
  function leftOverSpace(node, from, to) {
    let ranges = [];
    for (let n = node.firstChild, pos = from; ; n = n.nextSibling) {
      let nextPos = n ? n.from : to;
      if (nextPos > pos)
        ranges.push({from: pos, to: nextPos});
      if (!n)
        break;
      pos = n.to;
    }
    return ranges;
  }
  function parseCode(config) {
    let {codeParser, htmlParser} = config;
    let wrap = parseMixed((node, input) => {
      let id2 = node.type.id;
      if (codeParser && (id2 == Type.CodeBlock || id2 == Type.FencedCode)) {
        let info = "";
        if (id2 == Type.FencedCode) {
          let infoNode = node.node.getChild(Type.CodeInfo);
          if (infoNode)
            info = input.read(infoNode.from, infoNode.to);
        }
        let parser7 = codeParser(info);
        if (parser7)
          return {parser: parser7, overlay: (node2) => node2.type.id == Type.CodeText};
      } else if (htmlParser && (id2 == Type.HTMLBlock || id2 == Type.HTMLTag)) {
        return {parser: htmlParser, overlay: leftOverSpace(node.node, node.from, node.to)};
      }
      return null;
    });
    return {wrap};
  }
  var StrikethroughDelim = {resolve: "Strikethrough", mark: "StrikethroughMark"};
  var Strikethrough = {
    defineNodes: [{
      name: "Strikethrough",
      style: {"Strikethrough/...": tags.strikethrough}
    }, {
      name: "StrikethroughMark",
      style: tags.processingInstruction
    }],
    parseInline: [{
      name: "Strikethrough",
      parse(cx, next, pos) {
        if (next != 126 || cx.char(pos + 1) != 126 || cx.char(pos + 2) == 126)
          return -1;
        let before = cx.slice(pos - 1, pos), after = cx.slice(pos + 2, pos + 3);
        let sBefore = /\s|^$/.test(before), sAfter = /\s|^$/.test(after);
        let pBefore = Punctuation.test(before), pAfter = Punctuation.test(after);
        return cx.addDelimiter(StrikethroughDelim, pos, pos + 2, !sAfter && (!pAfter || sBefore || pBefore), !sBefore && (!pBefore || sAfter || pAfter));
      },
      after: "Emphasis"
    }]
  };
  function parseRow(cx, line, startI = 0, elts, offset = 0) {
    let count = 0, first = true, cellStart = -1, cellEnd = -1, esc = false;
    let parseCell = () => {
      elts.push(cx.elt("TableCell", offset + cellStart, offset + cellEnd, cx.parser.parseInline(line.slice(cellStart, cellEnd), offset + cellStart)));
    };
    for (let i = startI; i < line.length; i++) {
      let next = line.charCodeAt(i);
      if (next == 124 && !esc) {
        if (!first || cellStart > -1)
          count++;
        first = false;
        if (elts) {
          if (cellStart > -1)
            parseCell();
          elts.push(cx.elt("TableDelimiter", i + offset, i + offset + 1));
        }
        cellStart = cellEnd = -1;
      } else if (esc || next != 32 && next != 9) {
        if (cellStart < 0)
          cellStart = i;
        cellEnd = i + 1;
      }
      esc = !esc && next == 92;
    }
    if (cellStart > -1) {
      count++;
      if (elts)
        parseCell();
    }
    return count;
  }
  function hasPipe(str, start) {
    for (let i = start; i < str.length; i++) {
      let next = str.charCodeAt(i);
      if (next == 124)
        return true;
      if (next == 92)
        i++;
    }
    return false;
  }
  var delimiterLine = /^\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/;
  var TableParser = class {
    constructor() {
      this.rows = null;
    }
    nextLine(cx, line, leaf) {
      if (this.rows == null) {
        this.rows = false;
        let lineText;
        if ((line.next == 45 || line.next == 58 || line.next == 124) && delimiterLine.test(lineText = line.text.slice(line.pos))) {
          let firstRow = [], firstCount = parseRow(cx, leaf.content, 0, firstRow, leaf.start);
          if (firstCount == parseRow(cx, lineText, line.pos))
            this.rows = [
              cx.elt("TableHeader", leaf.start, leaf.start + leaf.content.length, firstRow),
              cx.elt("TableDelimiter", cx.lineStart + line.pos, cx.lineStart + line.text.length)
            ];
        }
      } else if (this.rows) {
        let content2 = [];
        parseRow(cx, line.text, line.pos, content2, cx.lineStart);
        this.rows.push(cx.elt("TableRow", cx.lineStart + line.pos, cx.lineStart + line.text.length, content2));
      }
      return false;
    }
    finish(cx, leaf) {
      if (!this.rows)
        return false;
      cx.addLeafElement(leaf, cx.elt("Table", leaf.start, leaf.start + leaf.content.length, this.rows));
      return true;
    }
  };
  var Table = {
    defineNodes: [
      {name: "Table", block: true},
      {name: "TableHeader", style: {"TableHeader/...": tags.heading}},
      "TableRow",
      {name: "TableCell", style: tags.content},
      {name: "TableDelimiter", style: tags.processingInstruction}
    ],
    parseBlock: [{
      name: "Table",
      leaf(_, leaf) {
        return hasPipe(leaf.content, 0) ? new TableParser() : null;
      },
      endLeaf(cx, line, leaf) {
        if (leaf.parsers.some((p) => p instanceof TableParser) || !hasPipe(line.text, line.basePos))
          return false;
        let next = cx.scanLine(cx.absoluteLineEnd + 1).text;
        return delimiterLine.test(next) && parseRow(cx, line.text, line.basePos) == parseRow(cx, next, line.basePos);
      },
      before: "SetextHeading"
    }]
  };
  var TaskParser = class {
    nextLine() {
      return false;
    }
    finish(cx, leaf) {
      cx.addLeafElement(leaf, cx.elt("Task", leaf.start, leaf.start + leaf.content.length, [
        cx.elt("TaskMarker", leaf.start, leaf.start + 3),
        ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3)
      ]));
      return true;
    }
  };
  var TaskList = {
    defineNodes: [
      {name: "Task", block: true, style: tags.list},
      {name: "TaskMarker", style: tags.atom}
    ],
    parseBlock: [{
      name: "TaskList",
      leaf(cx, leaf) {
        return /^\[[ xX]\]/.test(leaf.content) && cx.parentType().name == "ListItem" ? new TaskParser() : null;
      },
      after: "SetextHeading"
    }]
  };
  var GFM = [Table, TaskList, Strikethrough];
  function parseSubSuper(ch, node, mark) {
    return (cx, next, pos) => {
      if (next != ch || cx.char(pos + 1) == ch)
        return -1;
      let elts = [cx.elt(mark, pos, pos + 1)];
      for (let i = pos + 1; i < cx.end; i++) {
        let next2 = cx.char(i);
        if (next2 == ch)
          return cx.addElement(cx.elt(node, pos, i + 1, elts.concat(cx.elt(mark, i, i + 1))));
        if (next2 == 92)
          elts.push(cx.elt("Escape", i, i++ + 2));
        if (space3(next2))
          break;
      }
      return -1;
    };
  }
  var Superscript = {
    defineNodes: [
      {name: "Superscript", style: tags.special(tags.content)},
      {name: "SuperscriptMark", style: tags.processingInstruction}
    ],
    parseInline: [{
      name: "Superscript",
      parse: parseSubSuper(94, "Superscript", "SuperscriptMark")
    }]
  };
  var Subscript = {
    defineNodes: [
      {name: "Subscript", style: tags.special(tags.content)},
      {name: "SubscriptMark", style: tags.processingInstruction}
    ],
    parseInline: [{
      name: "Subscript",
      parse: parseSubSuper(126, "Subscript", "SubscriptMark")
    }]
  };
  var Emoji = {
    defineNodes: [{name: "Emoji", style: tags.character}],
    parseInline: [{
      name: "Emoji",
      parse(cx, next, pos) {
        let match;
        if (next != 58 || !(match = /^[a-zA-Z_0-9]+:/.exec(cx.slice(pos + 1, cx.end))))
          return -1;
        return cx.addElement(cx.elt("Emoji", pos, pos + 1 + match[0].length));
      }
    }]
  };

  // node_modules/@codemirror/lang-markdown/dist/index.js
  var data = /* @__PURE__ */ defineLanguageFacet({block: {open: "<!--", close: "-->"}});
  var commonmark = /* @__PURE__ */ parser6.configure({
    props: [
      /* @__PURE__ */ foldNodeProp.add((type) => {
        if (!type.is("Block") || type.is("Document"))
          return void 0;
        return (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to});
      }),
      /* @__PURE__ */ indentNodeProp.add({
        Document: () => null
      }),
      /* @__PURE__ */ languageDataProp.add({
        Document: data
      })
    ]
  });
  function mkLang(parser7) {
    return new Language(data, parser7, [], "markdown");
  }
  var commonmarkLanguage = /* @__PURE__ */ mkLang(commonmark);
  var extended = /* @__PURE__ */ commonmark.configure([GFM, Subscript, Superscript, Emoji]);
  var markdownLanguage = /* @__PURE__ */ mkLang(extended);
  function getCodeParser(languages, defaultLanguage) {
    return (info) => {
      if (info && languages) {
        let found = null;
        info = /\S*/.exec(info)[0];
        if (typeof languages == "function")
          found = languages(info);
        else
          found = LanguageDescription.matchLanguageName(languages, info, true);
        if (found instanceof LanguageDescription)
          return found.support ? found.support.language.parser : ParseContext.getSkippingParser(found.load());
        else if (found)
          return found.parser;
      }
      return defaultLanguage ? defaultLanguage.parser : null;
    };
  }
  var Context = class {
    constructor(node, from, to, spaceBefore, spaceAfter, type, item) {
      this.node = node;
      this.from = from;
      this.to = to;
      this.spaceBefore = spaceBefore;
      this.spaceAfter = spaceAfter;
      this.type = type;
      this.item = item;
    }
    blank(maxWidth, trailing = true) {
      let result = this.spaceBefore + (this.node.name == "Blockquote" ? ">" : "");
      if (maxWidth != null) {
        while (result.length < maxWidth)
          result += " ";
        return result;
      } else {
        for (let i = this.to - this.from - result.length - this.spaceAfter.length; i > 0; i--)
          result += " ";
        return result + (trailing ? this.spaceAfter : "");
      }
    }
    marker(doc2, add) {
      let number2 = this.node.name == "OrderedList" ? String(+itemNumber(this.item, doc2)[2] + add) : "";
      return this.spaceBefore + number2 + this.type + this.spaceAfter;
    }
  };
  function getContext(node, doc2) {
    let nodes = [];
    for (let cur2 = node; cur2 && cur2.name != "Document"; cur2 = cur2.parent) {
      if (cur2.name == "ListItem" || cur2.name == "Blockquote" || cur2.name == "FencedCode")
        nodes.push(cur2);
    }
    let context = [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      let node2 = nodes[i], match;
      let line = doc2.lineAt(node2.from), startPos = node2.from - line.from;
      if (node2.name == "FencedCode") {
        context.push(new Context(node2, startPos, startPos, "", "", "", null));
      } else if (node2.name == "Blockquote" && (match = /^[ \t]*>( ?)/.exec(line.text.slice(startPos)))) {
        context.push(new Context(node2, startPos, startPos + match[0].length, "", match[1], ">", null));
      } else if (node2.name == "ListItem" && node2.parent.name == "OrderedList" && (match = /^([ \t]*)\d+([.)])([ \t]*)/.exec(line.text.slice(startPos)))) {
        let after = match[3], len = match[0].length;
        if (after.length >= 4) {
          after = after.slice(0, after.length - 4);
          len -= 4;
        }
        context.push(new Context(node2.parent, startPos, startPos + len, match[1], after, match[2], node2));
      } else if (node2.name == "ListItem" && node2.parent.name == "BulletList" && (match = /^([ \t]*)([-+*])([ \t]{1,4}\[[ xX]\])?([ \t]+)/.exec(line.text.slice(startPos)))) {
        let after = match[4], len = match[0].length;
        if (after.length > 4) {
          after = after.slice(0, after.length - 4);
          len -= 4;
        }
        let type = match[2];
        if (match[3])
          type += match[3].replace(/[xX]/, " ");
        context.push(new Context(node2.parent, startPos, startPos + len, match[1], after, type, node2));
      }
    }
    return context;
  }
  function itemNumber(item, doc2) {
    return /^(\s*)(\d+)(?=[.)])/.exec(doc2.sliceString(item.from, item.from + 10));
  }
  function renumberList(after, doc2, changes, offset = 0) {
    for (let prev = -1, node = after; ; ) {
      if (node.name == "ListItem") {
        let m = itemNumber(node, doc2);
        let number2 = +m[2];
        if (prev >= 0) {
          if (number2 != prev + 1)
            return;
          changes.push({from: node.from + m[1].length, to: node.from + m[0].length, insert: String(prev + 2 + offset)});
        }
        prev = number2;
      }
      let next = node.nextSibling;
      if (!next)
        break;
      node = next;
    }
  }
  var insertNewlineContinueMarkup = ({state, dispatch}) => {
    let tree = syntaxTree(state), {doc: doc2} = state;
    let dont = null, changes = state.changeByRange((range) => {
      if (!range.empty || !markdownLanguage.isActiveAt(state, range.from))
        return dont = {range};
      let pos = range.from, line = doc2.lineAt(pos);
      let context = getContext(tree.resolveInner(pos, -1), doc2);
      while (context.length && context[context.length - 1].from > pos - line.from)
        context.pop();
      if (!context.length)
        return dont = {range};
      let inner = context[context.length - 1];
      if (inner.to - inner.spaceAfter.length > pos - line.from)
        return dont = {range};
      let emptyLine = pos >= inner.to - inner.spaceAfter.length && !/\S/.test(line.text.slice(inner.to));
      if (inner.item && emptyLine) {
        if (inner.node.firstChild.to >= pos || line.from > 0 && !/[^\s>]/.test(doc2.lineAt(line.from - 1).text)) {
          let next = context.length > 1 ? context[context.length - 2] : null;
          let delTo, insert3 = "";
          if (next && next.item) {
            delTo = line.from + next.from;
            insert3 = next.marker(doc2, 1);
          } else {
            delTo = line.from + (next ? next.to : 0);
          }
          let changes3 = [{from: delTo, to: pos, insert: insert3}];
          if (inner.node.name == "OrderedList")
            renumberList(inner.item, doc2, changes3, -2);
          if (next && next.node.name == "OrderedList")
            renumberList(next.item, doc2, changes3);
          return {range: EditorSelection.cursor(delTo + insert3.length), changes: changes3};
        } else {
          let insert3 = "";
          for (let i = 0, e = context.length - 2; i <= e; i++) {
            insert3 += context[i].blank(i < e ? context[i + 1].from - insert3.length : null, i < e);
          }
          insert3 += state.lineBreak;
          return {range: EditorSelection.cursor(pos + insert3.length), changes: {from: line.from, insert: insert3}};
        }
      }
      if (inner.node.name == "Blockquote" && emptyLine && line.from) {
        let prevLine = doc2.lineAt(line.from - 1), quoted = />\s*$/.exec(prevLine.text);
        if (quoted && quoted.index == inner.from) {
          let changes3 = state.changes([
            {from: prevLine.from + quoted.index, to: prevLine.to},
            {from: line.from + inner.from, to: line.to}
          ]);
          return {range: range.map(changes3), changes: changes3};
        }
      }
      let changes2 = [];
      if (inner.node.name == "OrderedList")
        renumberList(inner.item, doc2, changes2);
      let continued = inner.item && inner.item.from < line.from;
      let insert2 = "";
      if (!continued || /^[\s\d.)\-+*>]*/.exec(line.text)[0].length >= inner.to) {
        for (let i = 0, e = context.length - 1; i <= e; i++) {
          insert2 += i == e && !continued ? context[i].marker(doc2, 1) : context[i].blank(i < e ? context[i + 1].from - insert2.length : null);
        }
      }
      let from = pos;
      while (from > line.from && /\s/.test(line.text.charAt(from - line.from - 1)))
        from--;
      insert2 = state.lineBreak + insert2;
      changes2.push({from, to: pos, insert: insert2});
      return {range: EditorSelection.cursor(from + insert2.length), changes: changes2};
    });
    if (dont)
      return false;
    dispatch(state.update(changes, {scrollIntoView: true, userEvent: "input"}));
    return true;
  };
  function isMark(node) {
    return node.name == "QuoteMark" || node.name == "ListMark";
  }
  function contextNodeForDelete(tree, pos) {
    let node = tree.resolveInner(pos, -1), scan = pos;
    if (isMark(node)) {
      scan = node.from;
      node = node.parent;
    }
    for (let prev; prev = node.childBefore(scan); ) {
      if (isMark(prev)) {
        scan = prev.from;
      } else if (prev.name == "OrderedList" || prev.name == "BulletList") {
        node = prev.lastChild;
        scan = node.to;
      } else {
        break;
      }
    }
    return node;
  }
  var deleteMarkupBackward = ({state, dispatch}) => {
    let tree = syntaxTree(state);
    let dont = null, changes = state.changeByRange((range) => {
      let pos = range.from, {doc: doc2} = state;
      if (range.empty && markdownLanguage.isActiveAt(state, range.from)) {
        let line = doc2.lineAt(pos);
        let context = getContext(contextNodeForDelete(tree, pos), doc2);
        if (context.length) {
          let inner = context[context.length - 1];
          let spaceEnd = inner.to - inner.spaceAfter.length + (inner.spaceAfter ? 1 : 0);
          if (pos - line.from > spaceEnd && !/\S/.test(line.text.slice(spaceEnd, pos - line.from)))
            return {
              range: EditorSelection.cursor(line.from + spaceEnd),
              changes: {from: line.from + spaceEnd, to: pos}
            };
          if (pos - line.from == spaceEnd) {
            let start = line.from + inner.from;
            if (inner.item && inner.node.from < inner.item.from && /\S/.test(line.text.slice(inner.from, inner.to)))
              return {range, changes: {from: start, to: line.from + inner.to, insert: inner.blank(inner.to - inner.from)}};
            if (start < pos)
              return {range: EditorSelection.cursor(start), changes: {from: start, to: pos}};
          }
        }
      }
      return dont = {range};
    });
    if (dont)
      return false;
    dispatch(state.update(changes, {scrollIntoView: true, userEvent: "delete"}));
    return true;
  };
  var markdownKeymap = [
    {key: "Enter", run: insertNewlineContinueMarkup},
    {key: "Backspace", run: deleteMarkupBackward}
  ];
  var htmlNoMatch = /* @__PURE__ */ html({matchClosingTags: false});
  function markdown(config = {}) {
    let {codeLanguages, defaultCodeLanguage, addKeymap = true, base: {parser: parser7} = commonmarkLanguage} = config;
    if (!(parser7 instanceof MarkdownParser))
      throw new RangeError("Base parser provided to `markdown` should be a Markdown parser");
    let extensions = config.extensions ? [config.extensions] : [];
    let support = [htmlNoMatch.support], defaultCode;
    if (defaultCodeLanguage instanceof LanguageSupport) {
      support.push(defaultCodeLanguage.support);
      defaultCode = defaultCodeLanguage.language;
    } else if (defaultCodeLanguage) {
      defaultCode = defaultCodeLanguage;
    }
    let codeParser = codeLanguages || defaultCode ? getCodeParser(codeLanguages, defaultCode) : void 0;
    extensions.push(parseCode({codeParser, htmlParser: htmlNoMatch.language.parser}));
    if (addKeymap)
      support.push(Prec.high(keymap.of(markdownKeymap)));
    return new LanguageSupport(mkLang(parser7.configure(extensions)), support);
  }

  // node_modules/@uiw/codemirror-themes/esm/index.js
  var createTheme = (_ref) => {
    var {
      theme: theme3,
      settings,
      styles
    } = _ref;
    var themeOptions = {
      "&": {
        backgroundColor: settings.background,
        color: settings.foreground
      },
      ".cm-gutters": {}
    };
    if (settings.fontFamily) {
      themeOptions["&.cm-editor .cm-scroller"] = {
        fontFamily: settings.fontFamily
      };
    }
    if (settings.gutterBackground) {
      themeOptions[".cm-gutters"].backgroundColor = settings.gutterBackground;
    }
    if (settings.gutterForeground) {
      themeOptions[".cm-gutters"].color = settings.gutterForeground;
    }
    if (settings.gutterBorder) {
      themeOptions[".cm-gutters"].borderRightColor = settings.gutterBorder;
    }
    if (settings.caret) {
      themeOptions[".cm-content"] = {
        caretColor: settings.caret
      };
      themeOptions[".cm-cursor, .cm-dropCursor"] = {
        borderLeftColor: settings.caret
      };
    }
    var activeLineGutterStyle = {};
    if (settings.gutterActiveForeground) {
      activeLineGutterStyle.color = settings.gutterActiveForeground;
    }
    if (settings.lineHighlight) {
      themeOptions[".cm-activeLine"] = {
        backgroundColor: settings.lineHighlight
      };
      activeLineGutterStyle.backgroundColor = settings.lineHighlight;
    }
    themeOptions[".cm-activeLineGutter"] = activeLineGutterStyle;
    if (settings.selection) {
      themeOptions["&.cm-focused .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection"] = {
        backgroundColor: settings.selection
      };
    }
    if (settings.selectionMatch) {
      themeOptions["& .cm-selectionMatch"] = {
        backgroundColor: settings.selectionMatch
      };
    }
    var themeExtension = EditorView.theme(themeOptions, {
      dark: theme3 === "dark"
    });
    var highlightStyle = HighlightStyle.define(styles);
    var extension = [themeExtension, syntaxHighlighting(highlightStyle)];
    return extension;
  };

  // resources/js/themes/dark.js
  var darkTheme2 = createTheme({
    theme: "dark",
    settings: {
      background: "#292A30",
      foreground: "#CECFD0",
      caret: "#fff",
      selection: "#727377",
      selectionMatch: "#727377",
      lineHighlight: "#2F3239"
    },
    styles: [
      {tag: [tags.comment, tags.quote], color: "#7F8C98"},
      {tag: [tags.keyword], color: "#FF7AB2", fontWeight: "bold"},
      {tag: [tags.string, tags.meta], color: "#FF8170"},
      {tag: [tags.typeName], color: "#DABAFF"},
      {tag: [tags.definition(tags.variableName)], color: "#6BDFFF"},
      {tag: [tags.name], color: "#6BAA9F"},
      {tag: [tags.variableName], color: "#ACF2E4"},
      {tag: [tags.regexp, tags.link], color: "#FF8170"}
    ]
  });
  var dark_default = darkTheme2;

  // resources/js/themes/light.js
  var lightTheme = createTheme({
    theme: "light",
    settings: {
      background: "#fff",
      foreground: "#3D3D3D",
      selection: "#BBDFFF",
      selectionMatch: "#BBDFFF",
      gutterBackground: "#fff",
      gutterForeground: "#AFAFAF",
      lineHighlight: "#EDF4FF"
    },
    styles: [
      {tag: [tags.comment, tags.quote], color: "#707F8D"},
      {tag: [tags.typeName, tags.typeOperator], color: "#aa0d91"},
      {tag: [tags.keyword], color: "#aa0d91", fontWeight: "bold"},
      {tag: [tags.string, tags.meta], color: "#D23423"},
      {tag: [tags.name], color: "#032f62"},
      {tag: [tags.typeName], color: "#522BB2"},
      {tag: [tags.variableName], color: "#23575C"},
      {tag: [tags.definition(tags.variableName)], color: "#327A9E"},
      {tag: [tags.regexp, tags.link], color: "#0e0eff"}
    ]
  });
  var light_default = lightTheme;

  // resources/js/code-field.js
  var theme2 = new Compartment();
  var code_field_default = (Alpine) => {
    Alpine.data("filamentCodeField", ({
      state,
      language: language2,
      disabled,
      withLineNumbers,
      withAutocompletion
    }) => {
      return {
        state,
        codeMirror: null,
        parsers: {json, css, html, javascript, xml, markdown},
        init() {
          this.codeMirror = new EditorView({
            doc: this.parsedState(),
            extensions: this.buildExtensionsArray(),
            parent: this.$refs.codeBlock
          });
          window.addEventListener("dark-mode-toggled", (e) => {
            this.codeMirror.dispatch({
              effects: theme2.reconfigure(e.detail === "dark" ? dark_default : light_default)
            });
          });
        },
        parsedState() {
          if (language2 === "json") {
            return this.state ? this.state : "{\n\n}";
          }
          return this.state;
        },
        buildExtensionsArray() {
          const darkModeElement = document.querySelector("[dark-mode]");
          const lightMode = darkModeElement._x_dataStack[0].theme === "light";
          let extensions = [
            this.parsers[language2](),
            keymap.of([indentWithTab]),
            theme2.of(lightMode ? light_default : dark_default),
            EditorView.contentAttributes.of({contenteditable: !disabled}),
            EditorView.lineWrapping,
            EditorView.updateListener.of((v) => {
              if (v.docChanged) {
                this.state = v.state.doc.toString();
              }
            })
          ];
          if (withAutocompletion) {
            extensions.push(autocompletion());
          }
          if (withLineNumbers) {
            extensions.push(lineNumbers());
          }
          return extensions;
        }
      };
    });
  };

  // resources/js/plugin.js
  document.addEventListener("alpine:init", () => {
    window.Alpine.plugin(code_field_default);
  });
})();