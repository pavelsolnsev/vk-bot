import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { VK } from 'vk-io'
import { scheduleListRefresh } from '../src/services/listRefreshDebounce.js'
import { createEventStore } from '../src/store/eventStore.js'
import { sendCallbackAnswer } from '../src/vk/callbackAnswer.js'

test('button answers keep click order ahead of pending notifications', async () => {
  const vk = new VK({ token: 'test', apiLimit: 1000 })
  const sent = []
  const enqueue = vk.api.callWithRequest.bind(vk.api)
  vk.api.callWithRequest = request => {
    request.make = async () => {
      sent.push(request.params.event_id ?? request.params.random_id)
      return { response: 1 }
    }
    return enqueue(request)
  }
  const notifications = Array.from({ length: 90 }, (_, i) => vk.api.messages.send({ random_id: i + 1 }))
  const answers = ['first', 'second'].map(eventId => sendCallbackAnswer(vk, { eventId, peerId: 1, userId: 2 }))
  await Promise.all([...notifications, ...answers])
  assert.deepEqual(sent, ['first', 'second', ...notifications.map((_, i) => i + 1)])
})

test('clicks share a refresh window and edits never overlap', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const store = createEventStore()
  const event = store.createEvent({ peerId: 1, date: '19.11.2026', time: '19:00', place: 'tr', teamSlots: ['A', 'B'] })
  event.listMessageId = 1
  let edits = 0
  let finishEdit
  const edit = () => {
    edits++
    return new Promise(resolve => { finishEdit = resolve })
  }
  const vk = { api: { messages: { edit } } }
  const click = () => scheduleListRefresh({ vk, store, context: { peerId: 1 }, event, userId: 2 })
  click()
  t.mock.timers.tick(600)
  click()
  t.mock.timers.tick(200)
  await setImmediate()
  assert.equal(edits, 1)
  click()
  t.mock.timers.tick(900)
  click()
  assert.equal(edits, 1)
  finishEdit()
  await setImmediate()
  t.mock.timers.tick(800)
  await setImmediate()
  assert.equal(edits, 2)
  finishEdit()
  await setImmediate()
})
