import doc from 'global/document'
import win from 'global/window'
import createElement from 'virtual-dom/create-element'
import diff from 'virtual-dom/diff'
import patch from 'virtual-dom/patch'
import h from 'virtual-dom/h'
import debounce from 'debounce'
import {VFile} from 'vfile'
import {statistics} from 'vfile-statistics'
import {sort} from 'vfile-sort'
import {unified} from 'unified'
import retextEnglish from 'retext-english'
import retextEquality from 'retext-equality'
import retextProfanities from 'retext-profanities'

var processor = unified()
  .use(retextEnglish)
  .use(retextEquality)
  .use(retextProfanities)
  .use(severity)

var root = doc.querySelector('#root')
var tree = render(doc.querySelector('template').innerHTML)
var dom = root.appendChild(createElement(tree))

function onchange(ev) {
  var next = render(ev.target.value)
  dom = patch(dom, diff(tree, next))
  tree = next
}

function resize() {
  dom.lastChild.rows = rows(dom.firstChild)
}

function render(text) {
  var file = new VFile(text)
  var tree = processor.parse(file)
  var change = debounce(onchange, 4)
  var key = 0

  processor.runSync(tree, file)

  setTimeout(resize, 4)

  return h('div', {className: 'document'}, [
    h('div', {key: 'draw', className: 'draw'}, pad(all(file))),
    h('div', {key: 'messages', className: 'messages'}, messages(file)),
    h('textarea', {
      key: 'area',
      value: text,
      oninput: change,
      onpaste: change,
      onkeyup: change,
      onmouseup: change
    })
  ])

  function all(file) {
    var offsets = getOffsets(file.messages)
    var length = offsets.length
    var results = []
    var index = -1
    var last = 0
    var offset

    while (++index < length) {
      offset = offsets[index]

      results.push(text.slice(last, offset[0]))
      results.push(
        h(
          'span.offense',
          {key: key++, className: offset[2] ? 'error' : 'warn'},
          text.slice(offset[0], offset[1])
        )
      )

      last = offset[1]
    }

    results.push(text.slice(last))

    return results
  }

  /* Trailing white-space in a `textarea` is shown, but not in a `div`
   * with `white-space: pre-wrap`. Add a `br` to make the last newline
   * explicit. */
  function pad(nodes) {
    var tail = nodes[nodes.length - 1]

    if (typeof tail === 'string' && tail.charAt(tail.length - 1) === '\n') {
      nodes.push(h('br', {key: 'break'}))
    }

    return nodes
  }

  function messages(file) {
    var messages = file.messages
    var stats = statistics(file)
    var index = -1
    var length = messages.length
    var results = []
    var message

    while (++index < length) {
      message = messages[index]
      results[index] = h('li.issue', {key: index}, decorateMessage(message))
    }

    return [
      h('ol.issues', {className: length ? '' : 'empty'}, results),
      h('.issue-summary', {key: 'summary'}, [
        h('span.filename', 'example.md'),
        h('span.counts', [
          h(
            'span.count',
            {className: stats.fatal ? 'error' : ''},
            String(stats.fatal)
          ),
          h(
            'span.count',
            {className: stats.nonfatal ? 'warn' : ''},
            String(stats.nonfatal)
          ),
          h('span.count', '0')
        ])
      ])
    ]
  }
}

function rows(node) {
  return (
    Math.ceil(
      node.getBoundingClientRect().height /
        parseInt(win.getComputedStyle(node).lineHeight, 10)
    ) + 1
  )
}

function decorateMessage(message) {
  var value = message.reason
  var re = /[“`](.+?)[`”]/g
  var results = []
  var index = value.indexOf('use')
  var match
  var last = 0
  var sub
  var name

  while ((match = re.exec(value))) {
    sub = value.slice(last, re.lastIndex - match[0].length)

    if (sub) {
      results.push(sub)
    }

    name = re.lastIndex > index ? 'ok' : 'nok'

    if (message.source === 'retext-profanities') {
      name = 'nok'
    }

    results.push(h('code.label.label-' + name, match[1]))

    last = re.lastIndex
  }

  sub = value.slice(last)

  if (sub) {
    results.push(sub)
  }

  return [h('span.source', message.name), h('span.line', results)]
}

function getOffsets(messages) {
  var length = messages.length
  var map = {}
  var offsets = []
  var index = -1
  var message
  var position
  var start
  var end
  var key
  var prev

  /* Algorithm is a bit funky as the locations are sorted,
   * thus we can expect a lot to be true. */
  while (++index < length) {
    message = messages[index]
    position = message.position || {}
    start = position.start && position.start.offset
    end = position.end && position.end.offset

    if (isNaN(start) || isNaN(end)) {
      continue
    }

    if (prev && end < prev) {
      continue
    }

    prev = end

    if (start in map) {
      if (end > map[start]) {
        map[start] = {end: end, fatal: message.fatal}
      }
    } else {
      map[start] = {end: end, fatal: message.fatal}
    }
  }

  for (key in map) {
    offsets.push([Number(key), map[key].end, map[key].fatal])
  }

  return offsets
}

function severity() {
  var map = {
    0: null,
    1: false,
    2: true,
    undefined: false
  }

  return transformer

  function transformer(tree, file) {
    sort(file)
    file.messages.forEach(transform)
  }

  function transform(message) {
    message.fatal = map[message.profanitySeverity]
  }
}
