import { moduleFor, RenderingTestCase, runTask } from 'internal-test-helpers';

import { Component } from '../utils/helpers';
import { _getCurrentRunLoop } from '@ember/runloop';
import {
  reset as instrumentationReset,
  subscribe as instrumentationSubscribe,
} from '@ember/instrumentation';
import { EMBER_IMPROVED_INSTRUMENTATION } from '@ember/canary-features';

let canDataTransfer = Boolean(document.createEvent('HTMLEvents').dataTransfer);

function fireNativeWithDataTransfer(node, type, dataTransfer) {
  let event = document.createEvent('HTMLEvents');
  event.initEvent(type, true, true);
  event.dataTransfer = dataTransfer;
  node.dispatchEvent(event);
}

function triggerEvent(node, event) {
  switch (event) {
    case 'focusin':
      return node.focus();
    case 'focusout':
      return node.blur();
    default:
      return node.trigger(event);
  }
}

const SUPPORTED_EMBER_EVENTS = {
  touchstart: 'touchStart',
  touchmove: 'touchMove',
  touchend: 'touchEnd',
  touchcancel: 'touchCancel',
  keydown: 'keyDown',
  keyup: 'keyUp',
  keypress: 'keyPress',
  mousedown: 'mouseDown',
  mouseup: 'mouseUp',
  contextmenu: 'contextMenu',
  click: 'click',
  dblclick: 'doubleClick',
  focusin: 'focusIn',
  focusout: 'focusOut',
  submit: 'submit',
  input: 'input',
  change: 'change',
  dragstart: 'dragStart',
  drag: 'drag',
  dragenter: 'dragEnter',
  dragleave: 'dragLeave',
  dragover: 'dragOver',
  drop: 'drop',
  dragend: 'dragEnd',
};

moduleFor(
  'EventDispatcher',
  class extends RenderingTestCase {
    ['@test event handler methods are called when event is triggered'](assert) {
      let receivedEvent;
      let browserEvent;

      this.registerComponent('x-button', {
        ComponentClass: Component.extend(
          {
            tagName: 'button',
          },
          Object.keys(SUPPORTED_EMBER_EVENTS)
            .map((browerEvent) => ({
              [SUPPORTED_EMBER_EVENTS[browerEvent]](event) {
                receivedEvent = event;
              },
            }))
            .reduce((result, singleEventHandler) => ({ ...result, ...singleEventHandler }), {})
        ),
      });

      this.render(`{{x-button}}`);

      let elementNode = this.$('button');
      let element = elementNode[0];

      for (browserEvent in SUPPORTED_EMBER_EVENTS) {
        receivedEvent = null;
        runTask(() => triggerEvent(elementNode, browserEvent));
        assert.ok(receivedEvent, `${browserEvent} event was triggered`);
        assert.strictEqual(receivedEvent.target, element);
      }
    }

    ['@test event listeners are called when event is triggered'](assert) {
      let receivedEvent;
      let browserEvent;

      this.registerComponent('x-button', {
        ComponentClass: Component.extend({
          tagName: 'button',
          init() {
            this._super();
            Object.keys(SUPPORTED_EMBER_EVENTS).forEach((browserEvent) => {
              this.on(SUPPORTED_EMBER_EVENTS[browserEvent], (event) => (receivedEvent = event));
            });
          },
        }),
      });

      this.render(`{{x-button}}`);

      let elementNode = this.$('button');
      let element = elementNode[0];

      for (browserEvent in SUPPORTED_EMBER_EVENTS) {
        receivedEvent = null;
        runTask(() => triggerEvent(elementNode, browserEvent));
        assert.ok(receivedEvent, `${browserEvent} event was triggered`);
        assert.strictEqual(receivedEvent.target, element);
      }
    }

    ['@test events bubble view hierarchy for form elements'](assert) {
      let receivedEvent;

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          change(event) {
            receivedEvent = event;
          },
        }),
        template: `<input id="is-done" type="checkbox">`,
      });

      this.render(`{{x-foo}}`);

      runTask(() => this.$('#is-done').trigger('change'));
      assert.ok(receivedEvent, 'change event was triggered');
      assert.strictEqual(receivedEvent.target, this.$('#is-done')[0]);
    }

    ['@test case insensitive events'](assert) {
      let receivedEvent;

      this.registerComponent('x-bar', {
        ComponentClass: Component.extend({
          clicked(event) {
            receivedEvent = event;
          },
        }),
        template: `<button id="is-done" onclick={{action this.clicked}}>my button</button>`,
      });

      this.render(`{{x-bar}}`);

      runTask(() => this.$('#is-done').trigger('click'));
      assert.ok(receivedEvent, 'change event was triggered');
      assert.strictEqual(receivedEvent.target, this.$('#is-done')[0]);
    }

    ['@test case sensitive events'](assert) {
      let receivedEvent;

      this.registerComponent('x-bar', {
        ComponentClass: Component.extend({
          clicked(event) {
            receivedEvent = event;
          },
        }),
        template: `<button id="is-done" onClick={{action this.clicked}}>my button</button>`,
      });

      this.render(`{{x-bar}}`);

      runTask(() => this.$('#is-done').trigger('click'));
      assert.ok(receivedEvent, 'change event was triggered');
      assert.strictEqual(receivedEvent.target, this.$('#is-done')[0]);
    }

    ['@test events bubble to parent view'](assert) {
      let receivedEvent;

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          change(event) {
            receivedEvent = event;
          },
        }),
        template: `{{yield}}`,
      });

      this.registerComponent('x-bar', {
        ComponentClass: Component.extend({
          change() {},
        }),
        template: `<input id="is-done" type="checkbox">`,
      });

      this.render(`{{#x-foo}}{{x-bar}}{{/x-foo}}`);

      runTask(() => this.$('#is-done').trigger('change'));
      assert.ok(receivedEvent, 'change event was triggered');
      assert.strictEqual(receivedEvent.target, this.$('#is-done')[0]);
    }

    ['@test events bubbling up can be prevented by returning false'](assert) {
      let hasReceivedEvent;

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          change() {
            hasReceivedEvent = true;
          },
        }),
        template: `{{yield}}`,
      });

      this.registerComponent('x-bar', {
        ComponentClass: Component.extend({
          change() {
            return false;
          },
        }),
        template: `<input id="is-done" type="checkbox">`,
      });

      this.render(`{{#x-foo}}{{x-bar}}{{/x-foo}}`);

      runTask(() => this.$('#is-done').trigger('change'));
      assert.notOk(hasReceivedEvent, 'change event has not been received');
    }

    ['@test events bubbling up can be prevented by calling stopPropagation()'](assert) {
      let hasReceivedEvent;

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          change() {
            hasReceivedEvent = true;
          },
        }),
        template: `{{yield}}`,
      });

      this.registerComponent('x-bar', {
        ComponentClass: Component.extend({
          change(e) {
            e.stopPropagation();
          },
        }),
        template: `<input id="is-done" type="checkbox">`,
      });

      this.render(`{{#x-foo}}{{x-bar}}{{/x-foo}}`);

      runTask(() => this.$('#is-done').trigger('change'));
      assert.notOk(hasReceivedEvent, 'change event has not been received');
    }

    ['@test event handlers are wrapped in a run loop'](assert) {
      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          change() {
            assert.ok(_getCurrentRunLoop(), 'a run loop should have started');
          },
        }),
        template: `<input id="is-done" type="checkbox">`,
      });

      this.render(`{{x-foo}}`);

      this.$('#is-done').trigger('click');
    }

    ['@test native event on text node does not throw on hasAttribute [ISSUE #16730]'](assert) {
      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          actions: {
            someAction() {},
          },
        }),
        template: `<a id="inner" href="#" {{action 'someAction'}}>test</a>`,
      });

      this.render(`{{x-foo id="outer"}}`);

      let node = this.$('#inner')[0].childNodes[0];

      runTask(() => {
        let event = document.createEvent('HTMLEvents');
        event.initEvent('mousemove', true, true);
        node.dispatchEvent(event);
      });

      assert.ok(true);
    }

    ['@test [DEPRECATED] delegated event listeners work for mouseEnter/Leave'](assert) {
      let receivedEnterEvents = [];
      let receivedLeaveEvents = [];

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          mouseEnter(event) {
            receivedEnterEvents.push(event);
          },
          mouseLeave(event) {
            receivedLeaveEvents.push(event);
          },
        }),
        template: `<div id="inner"></div>`,
      });

      expectDeprecation(
        () => this.render(`{{x-foo id="outer"}}`),
        /Using `mouse(Enter|Leave)` event handler methods in components has been deprecated./
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      // mouse moves over #outer
      runTask(() => {
        this.$(outer).trigger('mouseenter', { canBubble: false, relatedTarget: parent });
        this.$(outer).trigger('mouseover', { relatedTarget: parent });
        this.$(parent).trigger('mouseout', { relatedTarget: outer });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was triggered');
      assert.strictEqual(receivedEnterEvents[0].target, outer);

      // mouse moves over #inner
      runTask(() => {
        this.$(inner).trigger('mouseover', { relatedTarget: outer });
        this.$(outer).trigger('mouseout', { relatedTarget: inner });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was not triggered again');

      // mouse moves out of #inner
      runTask(() => {
        this.$(inner).trigger('mouseout', { relatedTarget: outer });
        this.$(outer).trigger('mouseover', { relatedTarget: inner });
      });
      assert.equal(receivedLeaveEvents.length, 0, 'mouseleave event was not triggered');

      // mouse moves out of #outer
      runTask(() => {
        this.$(outer).trigger('mouseleave', { canBubble: false, relatedTarget: parent });
        this.$(outer).trigger('mouseout', { relatedTarget: parent });
        this.$(parent).trigger('mouseover', { relatedTarget: outer });
      });
      assert.equal(receivedLeaveEvents.length, 1, 'mouseleave event was triggered');
      assert.strictEqual(receivedLeaveEvents[0].target, outer);
    }

    ['@test [DEPRECATED] delegated event listeners work for mouseEnter on SVG elements'](assert) {
      let receivedEnterEvents = [];
      let receivedLeaveEvents = [];

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          tagName: 'svg',
          mouseEnter(event) {
            receivedEnterEvents.push(event);
          },
          mouseLeave(event) {
            receivedLeaveEvents.push(event);
          },
        }),
        template: `<g id="inner"></g>`,
      });

      expectDeprecation(
        () => this.render(`{{x-foo id="outer"}}`),
        /Using `mouse(Enter|Leave)` event handler methods in components has been deprecated./
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      // mouse moves over #outer
      runTask(() => {
        this.$(outer).trigger('mouseenter', { canBubble: false, relatedTarget: parent });
        this.$(outer).trigger('mouseover', { relatedTarget: parent });
        this.$(parent).trigger('mouseout', { relatedTarget: outer });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was triggered');
      assert.strictEqual(receivedEnterEvents[0].target, outer);

      // mouse moves over #inner
      runTask(() => {
        this.$(inner).trigger('mouseover', { relatedTarget: outer });
        this.$(outer).trigger('mouseout', { relatedTarget: inner });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was not triggered again');

      // mouse moves out of #inner
      runTask(() => {
        this.$(inner).trigger('mouseout', { relatedTarget: outer });
        this.$(outer).trigger('mouseover', { relatedTarget: inner });
      });
      assert.equal(receivedLeaveEvents.length, 0, 'mouseleave event was not triggered');

      // mouse moves out of #outer
      runTask(() => {
        this.$(outer).trigger('mouseleave', { canBubble: false, relatedTarget: parent });
        this.$(outer).trigger('mouseout', { relatedTarget: parent });
        this.$(parent).trigger('mouseover', { relatedTarget: outer });
      });
      assert.equal(receivedLeaveEvents.length, 1, 'mouseleave event was triggered');
      assert.strictEqual(receivedLeaveEvents[0].target, outer);
    }

    ['@test [DEPRECATED] delegated event listeners work for mouseEnter/Leave with skipped events'](
      assert
    ) {
      let receivedEnterEvents = [];
      let receivedLeaveEvents = [];

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          mouseEnter(event) {
            receivedEnterEvents.push(event);
          },
          mouseLeave(event) {
            receivedLeaveEvents.push(event);
          },
        }),
        template: `<div id="inner"></div>`,
      });

      expectDeprecation(
        () => this.render(`{{x-foo id="outer"}}`),
        /Using `mouse(Enter|Leave)` event handler methods in components has been deprecated./
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      // we replicate fast mouse movement, where mouseover is fired directly in #inner, skipping #outer
      runTask(() => {
        this.$(outer).trigger('mouseenter', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseover', { relatedTarget: parent });
        this.$(parent).trigger('mouseout', { relatedTarget: inner });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was triggered');
      assert.strictEqual(receivedEnterEvents[0].target, inner);

      // mouse moves out of #outer
      runTask(() => {
        this.$(outer).trigger('mouseleave', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseout', { relatedTarget: parent });
        this.$(parent).trigger('mouseover', { relatedTarget: inner });
      });
      assert.equal(receivedLeaveEvents.length, 1, 'mouseleave event was triggered');
      assert.strictEqual(receivedLeaveEvents[0].target, inner);
    }

    ['@test [DEPRECATED] delegated event listeners work for mouseEnter/Leave with skipped events and subcomponent'](
      assert
    ) {
      let receivedEnterEvents = [];
      let receivedLeaveEvents = [];

      this.registerComponent('x-outer', {
        ComponentClass: Component.extend({
          mouseEnter(event) {
            receivedEnterEvents.push(event);
          },
          mouseLeave(event) {
            receivedLeaveEvents.push(event);
          },
        }),
        template: `{{yield}}`,
      });

      this.registerComponent('x-inner', {
        ComponentClass: Component.extend(),
        template: ``,
      });

      expectDeprecation(
        () => this.render(`{{#x-outer id="outer"}}{{x-inner id="inner"}}{{/x-outer}}`),
        /Using `mouse(Enter|Leave)` event handler methods in components has been deprecated./
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      // we replicate fast mouse movement, where mouseover is fired directly in #inner, skipping #outer
      runTask(() => {
        this.$(outer).trigger('mouseenter', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseover', { relatedTarget: parent });
        this.$(parent).trigger('mouseout', { relatedTarget: inner });
      });
      assert.equal(receivedEnterEvents.length, 1, 'mouseenter event was triggered');
      assert.strictEqual(receivedEnterEvents[0].target, inner);

      // mouse moves out of #inner
      runTask(() => {
        this.$(outer).trigger('mouseleave', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseout', { relatedTarget: parent });
        this.$(parent).trigger('mouseover', { relatedTarget: inner });
      });

      assert.equal(receivedLeaveEvents.length, 1, 'mouseleave event was triggered');
      assert.strictEqual(receivedLeaveEvents[0].target, inner);
    }

    ['@test [DEPRECATED] supports mouseMove events'](assert) {
      let receivedEvent;

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          mouseMove(event) {
            receivedEvent = event;
          },
        }),
        template: `<div id="inner"></div>`,
      });

      expectDeprecation(
        /Using `mouseMove` event handler methods in components has been deprecated\./
      );

      this.render(`{{x-foo}}`);

      runTask(() => this.$('#inner').trigger('mousemove'));
      assert.ok(receivedEvent, 'mousemove event was triggered');
    }
  }
);

moduleFor(
  'EventDispatcher#setup',
  class extends RenderingTestCase {
    constructor() {
      super(...arguments);

      this.dispatcher = this.owner.lookup('event_dispatcher:main');
    }

    getBootOptions() {
      return {
        skipEventDispatcher: true,
      };
    }

    ['@test additional events can be specified'](assert) {
      this.dispatcher.setup({ myevent: 'myEvent' });

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          myEvent() {
            assert.ok(true, 'custom event was triggered');
          },
        }),
        template: `<p>Hello!</p>`,
      });

      this.render(`{{x-foo}}`);

      this.$('div').trigger('myevent');
    }

    ['@test a rootElement can be specified'](assert) {
      this.element.innerHTML = '<div id="app"></div>';
      // this.$().append('<div id="app"></div>');
      this.dispatcher.setup({ myevent: 'myEvent' }, '#app');

      assert.ok(this.$('#app').hasClass('ember-application'), 'custom rootElement was used');
      assert.equal(this.dispatcher.rootElement, '#app', 'the dispatchers rootElement was updated');
    }

    ['@test default events can be disabled via `customEvents`'](assert) {
      this.dispatcher.setup({ click: null });

      this.registerComponent('x-foo', {
        ComponentClass: Component.extend({
          click() {
            assert.ok(false, 'click method was called');
          },

          null() {
            assert.ok(false, 'null method was called');
          },

          doubleClick() {
            assert.ok(true, 'a non-disabled event is still handled properly');
          },
        }),

        template: `<p>Hello!</p>`,
      });

      this.render(`{{x-foo}}`);

      this.$('div').trigger('click');
      this.$('div').trigger('dblclick');
    }

    ['@test throws if specified rootElement does not exist'](assert) {
      assert.throws(() => {
        this.dispatcher.setup({ myevent: 'myEvent' }, '#app');
      });
    }
  }
);

if (EMBER_IMPROVED_INSTRUMENTATION) {
  moduleFor(
    'EventDispatcher - Instrumentation',
    class extends RenderingTestCase {
      teardown() {
        super.teardown();
        instrumentationReset();
      }

      ['@test instruments triggered events'](assert) {
        let clicked = 0;

        this.registerComponent('x-foo', {
          ComponentClass: Component.extend({
            click() {
              clicked++;
            },
          }),
          template: `<p>hello</p>`,
        });

        this.render(`{{x-foo}}`);

        this.$('div').trigger('click');

        assert.equal(clicked, 1, 'precond - the click handler was invoked');

        let clickInstrumented = 0;
        instrumentationSubscribe('interaction.click', {
          before() {
            clickInstrumented++;
            assert.equal(clicked, 1, 'invoked before event is handled');
          },
          after() {
            clickInstrumented++;
            assert.equal(clicked, 2, 'invoked after event is handled');
          },
        });

        let keypressInstrumented = 0;
        instrumentationSubscribe('interaction.keypress', {
          before() {
            keypressInstrumented++;
          },
          after() {
            keypressInstrumented++;
          },
        });

        this.$('div').trigger('click');
        this.$('div').trigger('change');
        assert.equal(clicked, 2, 'precond - The click handler was invoked');
        assert.equal(clickInstrumented, 2, 'The click was instrumented');
        assert.strictEqual(keypressInstrumented, 0, 'The keypress was not instrumented');
      }
    }
  );
}

if (canDataTransfer) {
  moduleFor(
    'EventDispatcher - Event Properties',
    class extends RenderingTestCase {
      ['@test dataTransfer property is added to drop event'](assert) {
        let receivedEvent;
        this.registerComponent('x-foo', {
          ComponentClass: Component.extend({
            drop(event) {
              receivedEvent = event;
            },
          }),
        });

        this.render(`{{x-foo}}`);

        fireNativeWithDataTransfer(this.$('div')[0], 'drop', 'success');
        assert.equal(receivedEvent.dataTransfer, 'success');
      }
    }
  );
}
