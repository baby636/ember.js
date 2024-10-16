import { RenderingTestCase, moduleFor, strip, runTask } from 'internal-test-helpers';

import { set } from '@ember/-internals/metal';
import {
  subscribe as instrumentationSubscribe,
  reset as instrumentationReset,
} from '@ember/instrumentation';
import { EMBER_IMPROVED_INSTRUMENTATION } from '@ember/canary-features';
import { Object as EmberObject, A as emberA } from '@ember/-internals/runtime';
import { ActionManager } from '@ember/-internals/views';

import { Component } from '../../utils/helpers';

function getActionAttributes(element) {
  let attributes = element.attributes;
  let actionAttrs = [];

  for (let i = 0; i < attributes.length; i++) {
    let attr = attributes.item(i);

    if (attr.name.indexOf('data-ember-action-') === 0) {
      actionAttrs.push(attr.name);
    }
  }

  return actionAttrs;
}

function getActionIds(element) {
  return getActionAttributes(element).map((attribute) =>
    attribute.slice('data-ember-action-'.length)
  );
}

if (EMBER_IMPROVED_INSTRUMENTATION) {
  moduleFor(
    'Helpers test: element action instrumentation',
    class extends RenderingTestCase {
      teardown() {
        super.teardown();
        instrumentationReset();
      }

      ['@test action should fire interaction event with proper params']() {
        let subscriberCallCount = 0;
        let subscriberPayload = null;

        let ExampleComponent = Component.extend({
          actions: {
            foo() {},
          },
        });

        this.registerComponent('example-component', {
          ComponentClass: ExampleComponent,
          template: '<button {{action "foo" "bar"}}>Click me</button>',
        });

        instrumentationSubscribe('interaction.ember-action', {
          before() {
            subscriberCallCount++;
          },
          after(name, time, payload) {
            subscriberPayload = payload;
          },
        });

        this.render('{{example-component}}');

        this.assert.equal(subscriberCallCount, 0, 'subscriber has not been called');

        runTask(() => this.rerender());

        this.assert.equal(subscriberCallCount, 0, 'subscriber has not been called');

        runTask(() => {
          this.$('button').click();
        });

        this.assert.equal(subscriberCallCount, 1, 'subscriber has been called 1 time');
        this.assert.equal(subscriberPayload.name, 'foo', 'subscriber called with correct name');
        this.assert.equal(subscriberPayload.args[0], 'bar', 'subscriber called with correct args');
      }
    }
  );
}

moduleFor(
  'Helpers test: element action',
  class extends RenderingTestCase {
    ['@test it can call an action on its enclosing component']() {
      let fooCallCount = 0;

      let ExampleComponent = Component.extend({
        actions: {
          foo() {
            fooCallCount++;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<button {{action "foo"}}>Click me</button>',
      });

      this.render('{{example-component}}');

      this.assert.equal(fooCallCount, 0, 'foo has not been called');

      runTask(() => this.rerender());

      this.assert.equal(fooCallCount, 0, 'foo has not been called');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.equal(fooCallCount, 1, 'foo has been called 1 time');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.equal(fooCallCount, 2, 'foo has been called 2 times');
    }

    ['@test it can call an action with parameters']() {
      let fooArgs = [];
      let component;

      let ExampleComponent = Component.extend({
        member: 'a',
        init() {
          this._super(...arguments);
          component = this;
        },
        actions: {
          foo(thing) {
            fooArgs.push(thing);
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<button {{action "foo" this.member}}>Click me</button>',
      });

      this.render('{{example-component}}');

      this.assert.deepEqual(fooArgs, [], 'foo has not been called');

      runTask(() => this.rerender());

      this.assert.deepEqual(fooArgs, [], 'foo has not been called');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.deepEqual(fooArgs, ['a'], 'foo has not been called');

      runTask(() => {
        component.set('member', 'b');
      });

      runTask(() => {
        this.$('button').click();
      });

      this.assert.deepEqual(fooArgs, ['a', 'b'], 'foo has been called with an updated value');
    }

    ['@test it should output a marker attribute with a guid']() {
      this.render('<button {{action "show"}}>me the money</button>');

      let button = this.$('button');

      let attributes = getActionAttributes(button[0]);

      this.assert.ok(
        button.attr('data-ember-action').match(''),
        'An empty data-ember-action attribute was added'
      );
      this.assert.ok(
        attributes[0].match(/data-ember-action-\d+/),
        'A data-ember-action-xyz attribute with a guid was added'
      );
    }

    ['@test it should allow alternative events to be handled']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div id="show" {{action "show" on="mouseUp"}}></div>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#show').trigger('mouseup');
      });

      this.assert.ok(showCalled, 'show action was called on mouseUp');
    }

    ['@test inside a yield, the target points at the original target']() {
      let targetWatted = false;
      let innerWatted = false;

      let TargetComponent = Component.extend({
        actions: {
          wat() {
            targetWatted = true;
          },
        },
      });

      let InnerComponent = Component.extend({
        actions: {
          wat() {
            innerWatted = true;
          },
        },
      });

      this.registerComponent('inner-component', {
        ComponentClass: InnerComponent,
        template: '{{yield}}',
      });

      this.registerComponent('target-component', {
        ComponentClass: TargetComponent,
        template: strip`
        {{#inner-component}}
          <button {{action "wat"}}>Wat me!</button>
        {{/inner-component}}
      `,
      });

      this.render('{{target-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.ok(targetWatted, 'the correct target was watted');
      this.assert.notOk(innerWatted, 'the inner target was not watted');
    }

    ['@test it should allow a target to be specified']() {
      let targetWatted = false;

      let TargetComponent = Component.extend({
        actions: {
          wat() {
            targetWatted = true;
          },
        },
      });

      let OtherComponent = Component.extend({});

      this.registerComponent('target-component', {
        ComponentClass: TargetComponent,
        template: '{{yield this}}',
      });

      this.registerComponent('other-component', {
        ComponentClass: OtherComponent,
        template: '<a {{action "wat" target=this.anotherTarget}}>Wat?</a>',
      });

      this.render(strip`
          {{#target-component as |parent|}}
            {{other-component anotherTarget=parent}}
          {{/target-component}}
        `);

      runTask(() => {
        this.$('a').click();
      });

      this.assert.equal(targetWatted, true, 'the specified target was watted');
    }

    ['@test it should lazily evaluate the target']() {
      let firstEdit = 0;
      let secondEdit = 0;
      let component;

      let first = {
        edit() {
          firstEdit++;
        },
      };

      let second = {
        edit() {
          secondEdit++;
        },
      };

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        theTarget: first,
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a {{action "edit" target=this.theTarget}}>Edit</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.equal(firstEdit, 1);

      runTask(() => {
        set(component, 'theTarget', second);
      });

      runTask(() => {
        this.$('a').click();
      });

      this.assert.equal(firstEdit, 1);
      this.assert.equal(secondEdit, 1);
    }

    ['@test it should register an event handler']() {
      let editHandlerWasCalled = false;
      let shortcutHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
          shortcut() {
            shortcutHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<a href="#" {{action "edit" allowedKeys="alt"}}>click me</a> <div {{action "shortcut" allowedKeys="any"}}>click me too</div>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a[data-ember-action]').trigger('click', { altKey: true });
      });

      this.assert.equal(editHandlerWasCalled, true, 'the event handler was called');

      runTask(() => {
        this.$('div[data-ember-action]').trigger('click', { ctrlKey: true });
      });

      this.assert.equal(
        shortcutHandlerWasCalled,
        true,
        'the "any" shortcut\'s event handler was called'
      );
    }

    ['@test it handles whitelisted bound modifier keys']() {
      let editHandlerWasCalled = false;
      let shortcutHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        altKey: 'alt',
        anyKey: 'any',
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
          shortcut() {
            shortcutHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<a href="#" {{action "edit" allowedKeys=this.altKey}}>click me</a> <div {{action "shortcut" allowedKeys=this.anyKey}}>click me too</div>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a[data-ember-action]').trigger('click', { altKey: true });
      });

      this.assert.equal(editHandlerWasCalled, true, 'the event handler was called');

      runTask(() => {
        this.$('div[data-ember-action]').trigger('click', { ctrlKey: true });
      });

      this.assert.equal(
        shortcutHandlerWasCalled,
        true,
        'the "any" shortcut\'s event handler was called'
      );
    }

    ['@test it handles whitelisted bound modifier keys with current value']() {
      let editHandlerWasCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        acceptedKeys: 'alt',
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a href="#" {{action "edit" allowedKeys=this.acceptedKeys}}>click me</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a[data-ember-action]').trigger('click', { altKey: true });
      });

      this.assert.equal(editHandlerWasCalled, true, 'the event handler was called');

      editHandlerWasCalled = false;

      runTask(() => {
        component.set('acceptedKeys', '');
      });

      runTask(() => {
        this.$('div[data-ember-action]').click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the event handler was not called');
    }

    ['@test should be able to use action more than once for the same event within a view']() {
      let editHandlerWasCalled = false;
      let deleteHandlerWasCalled = false;
      let originalHandlerWasCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
          delete() {
            deleteHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<a id="edit" href="#" {{action "edit"}}>edit</a><a id="delete" href="#" {{action "delete"}}>delete</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the edit action was called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(
        originalHandlerWasCalled,
        true,
        'the click handler was called (due to bubbling)'
      );

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.$('#delete').click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, true, 'the delete action was called');
      this.assert.equal(
        originalHandlerWasCalled,
        true,
        'the click handler was called (due to bubbling)'
      );

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.wrap(component.element).click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(originalHandlerWasCalled, true, 'the click handler was called');
    }

    ['@test the event should not bubble if `bubbles=false` is passed']() {
      let editHandlerWasCalled = false;
      let deleteHandlerWasCalled = false;
      let originalHandlerWasCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
          delete() {
            deleteHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<a id="edit" href="#" {{action "edit" bubbles=false}}>edit</a><a id="delete" href="#" {{action "delete" bubbles=false}}>delete</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the edit action was called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(originalHandlerWasCalled, false, 'the click handler was not called');

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.$('#delete').click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, true, 'the delete action was called');
      this.assert.equal(originalHandlerWasCalled, false, 'the click handler was not called');

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.wrap(component.element).click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(originalHandlerWasCalled, true, 'the click handler was called');
    }

    ['@test the event should not bubble if `bubbles=false` is passed bound']() {
      let editHandlerWasCalled = false;
      let deleteHandlerWasCalled = false;
      let originalHandlerWasCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        isFalse: false,
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
          delete() {
            deleteHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<a id="edit" href="#" {{action "edit" bubbles=this.isFalse}}>edit</a><a id="delete" href="#" {{action "delete" bubbles=this.isFalse}}>delete</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the edit action was called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(originalHandlerWasCalled, false, 'the click handler was not called');

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.$('#delete').click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, true, 'the delete action was called');
      this.assert.equal(originalHandlerWasCalled, false, 'the click handler was not called');

      editHandlerWasCalled = deleteHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        this.wrap(component.element).click();
      });

      this.assert.equal(editHandlerWasCalled, false, 'the edit action was not called');
      this.assert.equal(deleteHandlerWasCalled, false, 'the delete action was not called');
      this.assert.equal(originalHandlerWasCalled, true, 'the click handler was called');
    }

    ['@test the bubbling depends on the bound parameter']() {
      let editHandlerWasCalled = false;
      let originalHandlerWasCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        shouldBubble: false,
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a id="edit" href="#" {{action "edit" bubbles=this.shouldBubble}}>edit</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the edit action was called');
      this.assert.equal(originalHandlerWasCalled, false, 'the click handler was not called');

      editHandlerWasCalled = originalHandlerWasCalled = false;

      runTask(() => {
        component.set('shouldBubble', true);
      });

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the edit action was called');
      this.assert.equal(originalHandlerWasCalled, true, 'the click handler was called');
    }

    ['@test multiple actions with bubbles=false for same event are called but prevent bubbling']() {
      let clickAction1WasCalled = false;
      let clickAction2WasCalled = false;
      let eventHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          clicked1() {
            clickAction1WasCalled = true;
          },
          clicked2() {
            clickAction2WasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: strip`
        <a href="#"
          {{action "clicked1" on="click" bubbles=false}}
          {{action "clicked2" on="click" bubbles=false}}
        >click me</a>`,
        click() {
          eventHandlerWasCalled = true;
        },
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').trigger('click');
      });

      this.assert.ok(clickAction1WasCalled, 'the first clicked action was called');
      this.assert.ok(clickAction2WasCalled, 'the second clicked action was called');
      this.assert.notOk(eventHandlerWasCalled, 'event did not bubble up');
    }

    ['@test it should work properly in an #each block']() {
      let editHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        items: emberA([1, 2, 3, 4]),
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '{{#each this.items as |item|}}<a href="#" {{action "edit"}}>click me</a>{{/each}}',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the event handler was called');
    }

    ['@test it should work properly in a {{#let foo as |bar|}} block']() {
      let editHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        something: { ohai: 'there' },
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '{{#let this.something as |somethingElse|}}<a href="#" {{action "edit"}}>click me</a>{{/let}}',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.equal(editHandlerWasCalled, true, 'the event handler was called');
    }

    ['@test it should unregister event handlers when an element action is removed'](assert) {
      let ExampleComponent = Component.extend({
        actions: {
          edit() {},
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '{{#if this.isActive}}<a href="#" {{action "edit"}}>click me</a>{{/if}}',
      });

      this.render('{{example-component isActive=this.isActive}}', {
        isActive: true,
      });

      assert.equal(this.$('a[data-ember-action]').length, 1, 'The element is rendered');

      let actionId;

      actionId = getActionIds(this.$('a[data-ember-action]')[0])[0];

      assert.ok(ActionManager.registeredActions[actionId], 'An action is registered');

      runTask(() => this.rerender());

      assert.equal(this.$('a[data-ember-action]').length, 1, 'The element is still present');

      assert.ok(ActionManager.registeredActions[actionId], 'The action is still registered');

      runTask(() => set(this.context, 'isActive', false));

      assert.strictEqual(this.$('a[data-ember-action]').length, 0, 'The element is removed');

      assert.ok(!ActionManager.registeredActions[actionId], 'The action is unregistered');

      runTask(() => set(this.context, 'isActive', true));

      assert.equal(this.$('a[data-ember-action]').length, 1, 'The element is rendered');

      actionId = getActionIds(this.$('a[data-ember-action]')[0])[0];

      assert.ok(ActionManager.registeredActions[actionId], 'A new action is registered');
    }

    ['@test it should capture events from child elements and allow them to trigger the action']() {
      let editHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div {{action "edit"}}><button>click me</button></div>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.ok(
        editHandlerWasCalled,
        'event on a child target triggered the action of its parent'
      );
    }

    ['@test it should allow bubbling of events from action helper to original parent event']() {
      let editHandlerWasCalled = false;
      let originalHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a href="#" {{action "edit"}}>click me</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.ok(
        editHandlerWasCalled && originalHandlerWasCalled,
        'both event handlers were called'
      );
    }

    ['@test it should not bubble an event from action helper to original parent event if `bubbles=false` is passed']() {
      let editHandlerWasCalled = false;
      let originalHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
        click() {
          originalHandlerWasCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a href="#" {{action "edit" bubbles=false}}>click me</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.ok(editHandlerWasCalled, 'the child event handler was called');
      this.assert.notOk(originalHandlerWasCalled, 'the parent handler was not called');
    }

    ['@test it should allow "send" as the action name (#594)']() {
      let sendHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          send() {
            sendHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a href="#" {{action "send"}}>click me</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.ok(sendHandlerWasCalled, 'the event handler was called');
    }

    ['@test it should send the view, event, and current context to the action']() {
      let passedTarget;
      let passedContext;
      let targetThis;

      let TargetComponent = Component.extend({
        init() {
          this._super(...arguments);
          targetThis = this;
        },
        actions: {
          edit(context) {
            passedTarget = this === targetThis;
            passedContext = context;
          },
        },
      });

      let aContext;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          aContext = this;
        },
      });

      this.registerComponent('target-component', {
        ComponentClass: TargetComponent,
        template: '{{yield this}}',
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: strip`
        {{#target-component as |aTarget|}}
          <a id="edit" href="#" {{action "edit" this target=aTarget}}>click me</a>
        {{/target-component}}
        `,
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('#edit').click();
      });

      this.assert.ok(passedTarget, 'the action is called with the target as this');
      this.assert.strictEqual(passedContext, aContext, 'the parameter is passed along');
    }

    ['@test it should only trigger actions for the event they were registered on']() {
      let editHandlerWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          edit() {
            editHandlerWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a href="#" {{action "edit"}}>click me</a>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.ok(editHandlerWasCalled, 'the event handler was called on click');

      editHandlerWasCalled = false;

      runTask(() => {
        this.$('a').trigger('mouseover');
      });

      this.assert.notOk(editHandlerWasCalled, 'the event handler was not called on mouseover');
    }

    ['@test it should allow multiple contexts to be specified']() {
      let passedContexts;
      let models = [EmberObject.create(), EmberObject.create()];

      let ExampleComponent = Component.extend({
        modelA: models[0],
        modelB: models[1],
        actions: {
          edit(...args) {
            passedContexts = args;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<button {{action "edit" this.modelA this.modelB}}>click me</button>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.deepEqual(
        passedContexts,
        models,
        'the action was called with the passed contexts'
      );
    }

    ['@test it should allow multiple contexts to be specified mixed with string args']() {
      let passedContexts;
      let model = EmberObject.create();

      let ExampleComponent = Component.extend({
        model: model,
        actions: {
          edit(...args) {
            passedContexts = args;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<button {{action "edit" "herp" this.model}}>click me</button>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.deepEqual(
        passedContexts,
        ['herp', model],
        'the action was called with the passed contexts'
      );
    }

    ['@test it should not trigger action with special clicks']() {
      let showCalled = false;
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<button {{action "show" href=true}}>Howdy</button>',
      });

      this.render('{{example-component}}');

      let assert = this.assert;

      let checkClick = (prop, value, expected) => {
        showCalled = false;
        let event = this.wrap(component.element)
          .findAll('button')
          .trigger('click', { [prop]: value })[0];
        if (expected) {
          assert.ok(showCalled, `should call action with ${prop}:${value}`);
          assert.ok(event.defaultPrevented, 'should prevent default');
        } else {
          assert.notOk(showCalled, `should not call action with ${prop}:${value}`);
          assert.notOk(event.defaultPrevented, 'should not prevent default');
        }
      };

      checkClick('ctrlKey', true, false);
      checkClick('altKey', true, false);
      checkClick('metaKey', true, false);
      checkClick('shiftKey', true, false);

      checkClick('button', 0, true);
      checkClick('button', 1, false);
      checkClick('button', 2, false);
      checkClick('button', 3, false);
      checkClick('button', 4, false);
    }

    ['@test it can trigger actions for keyboard events']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<input type="text" {{action "show" on="keyUp"}}>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('input').trigger('keyup', { char: 'a', which: 65 });
      });

      this.assert.ok(showCalled, 'the action was called with keyup');
    }

    ['@test a quoteless parameter should allow dynamic lookup of the actionName']() {
      let lastAction;
      let actionOrder = [];
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        hookMeUp: 'rock',
        actions: {
          rock() {
            lastAction = 'rock';
            actionOrder.push('rock');
          },
          paper() {
            lastAction = 'paper';
            actionOrder.push('paper');
          },
          scissors() {
            lastAction = 'scissors';
            actionOrder.push('scissors');
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a id="bound-param" {{action this.hookMeUp}}>Whistle tips go woop woooop</a>',
      });

      this.render('{{example-component}}');

      let test = this;

      let testBoundAction = (propertyValue) => {
        runTask(() => {
          component.set('hookMeUp', propertyValue);
        });

        runTask(() => {
          this.wrap(component.element).findAll('#bound-param').click();
        });

        test.assert.ok(lastAction, propertyValue, `lastAction set to ${propertyValue}`);
      };

      testBoundAction('rock');
      testBoundAction('paper');
      testBoundAction('scissors');

      this.assert.deepEqual(
        actionOrder,
        ['rock', 'paper', 'scissors'],
        'action name was looked up properly'
      );
    }

    ['@test a quoteless string parameter should resolve actionName, including path']() {
      let lastAction;
      let actionOrder = [];
      let component;

      let ExampleComponent = Component.extend({
        init() {
          this._super(...arguments);
          component = this;
        },
        allactions: emberA([
          { title: 'Rock', name: 'rock' },
          { title: 'Paper', name: 'paper' },
          { title: 'Scissors', name: 'scissors' },
        ]),
        actions: {
          rock() {
            lastAction = 'rock';
            actionOrder.push('rock');
          },
          paper() {
            lastAction = 'paper';
            actionOrder.push('paper');
          },
          scissors() {
            lastAction = 'scissors';
            actionOrder.push('scissors');
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '{{#each this.allactions as |allaction|}}<a id="{{allaction.name}}" {{action allaction.name}}>{{allaction.title}}</a>{{/each}}',
      });

      this.render('{{example-component}}');

      let test = this;

      let testBoundAction = (propertyValue) => {
        runTask(() => {
          this.wrap(component.element).findAll(`#${propertyValue}`).click();
        });

        test.assert.ok(lastAction, propertyValue, `lastAction set to ${propertyValue}`);
      };

      testBoundAction('rock');
      testBoundAction('paper');
      testBoundAction('scissors');

      this.assert.deepEqual(
        actionOrder,
        ['rock', 'paper', 'scissors'],
        'action name was looked up properly'
      );
    }

    ['@test a quoteless function parameter should be called, including arguments']() {
      let submitCalled = false;
      let incomingArg;

      let arg = 'rough ray';

      let ExampleComponent = Component.extend({
        submit(actualArg) {
          incomingArg = actualArg;
          submitCalled = true;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: `<a {{action this.submit '${arg}'}}>Hi</a>`,
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').click();
      });

      this.assert.ok(submitCalled, 'submit function called');
      this.assert.equal(incomingArg, arg, 'argument passed');
    }

    ['@test a quoteless parameter that does not resolve to a value asserts']() {
      let ExampleComponent = Component.extend({
        actions: {
          ohNoeNotValid() {},
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a id="oops-bound-param" {{action this.ohNoeNotValid}}>Hi</a>',
      });

      expectAssertion(() => {
        this.render('{{example-component}}');
      }, 'You specified a quoteless path, `this.ohNoeNotValid`, to the {{action}} helper ' + 'which did not resolve to an action name (a string). ' + 'Perhaps you meant to use a quoted actionName? (e.g. {{action "ohNoeNotValid"}}).');
    }

    ['@test allows multiple actions on a single element']() {
      let clickActionWasCalled = false;
      let doubleClickActionWasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          clicked() {
            clickActionWasCalled = true;
          },
          doubleClicked() {
            doubleClickActionWasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: strip`
        <a href="#"
          {{action "clicked" on="click"}}
          {{action "doubleClicked" on="doubleClick"}}
        >click me</a>`,
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').trigger('click');
      });

      this.assert.ok(clickActionWasCalled, 'the clicked action was called');

      runTask(() => {
        this.$('a').trigger('dblclick');
      });

      this.assert.ok(doubleClickActionWasCalled, 'the doubleClicked action was called');
    }

    ['@test allows multiple actions for same event on a single element']() {
      let clickAction1WasCalled = false;
      let clickAction2WasCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          clicked1() {
            clickAction1WasCalled = true;
          },
          clicked2() {
            clickAction2WasCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: strip`
        <a href="#"
          {{action "clicked1" on="click"}}
          {{action "clicked2" on="click"}}
        >click me</a>`,
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('a').trigger('click');
      });

      this.assert.ok(clickAction1WasCalled, 'the first clicked action was called');
      this.assert.ok(clickAction2WasCalled, 'the second clicked action was called');
    }

    ['@test it should respect preventDefault option if provided']() {
      let ExampleComponent = Component.extend({
        actions: {
          show() {},
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a {{action "show" preventDefault=false}}>Hi</a>',
      });

      this.render('{{example-component}}');

      let event;

      runTask(() => {
        event = this.$('a').click()[0];
      });

      this.assert.equal(event.defaultPrevented, false, 'should not preventDefault');
    }

    ['@test it should respect preventDefault option if provided bound']() {
      let component;

      let ExampleComponent = Component.extend({
        shouldPreventDefault: false,
        init() {
          this._super(...arguments);
          component = this;
        },
        actions: {
          show() {},
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<a {{action "show" preventDefault=this.shouldPreventDefault}}>Hi</a>',
      });

      this.render('{{example-component}}');

      let event;

      runTask(() => {
        event = this.$('a').trigger(event)[0];
      });

      this.assert.equal(event.defaultPrevented, false, 'should not preventDefault');

      runTask(() => {
        component.set('shouldPreventDefault', true);
        event = this.$('a').trigger('click')[0];
      });

      this.assert.equal(event.defaultPrevented, true, 'should preventDefault');
    }

    ['@test it should target the proper component when `action` is in yielded block [GH #12409]']() {
      let outerActionCalled = false;
      let innerClickCalled = false;

      let OuterComponent = Component.extend({
        actions: {
          hey() {
            outerActionCalled = true;
          },
        },
      });

      let MiddleComponent = Component.extend({});

      let InnerComponent = Component.extend({
        click() {
          innerClickCalled = true;
          this.action();
        },
      });

      this.registerComponent('outer-component', {
        ComponentClass: OuterComponent,
        template: strip`
        {{#middle-component}}
          {{inner-component action=(action "hey")}}
        {{/middle-component}}
      `,
      });

      this.registerComponent('middle-component', {
        ComponentClass: MiddleComponent,
        template: '{{yield}}',
      });

      this.registerComponent('inner-component', {
        ComponentClass: InnerComponent,
        template: strip`
        <button>Click Me</button>
        {{yield}}
      `,
      });

      this.render('{{outer-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.ok(outerActionCalled, 'the action fired on the proper target');
      this.assert.ok(innerClickCalled, 'the click was triggered');
    }

    ['@test element action with (mut undefinedThing) works properly']() {
      let component;

      let ExampleComponent = Component.extend({
        label: undefined,
        init() {
          this._super(...arguments);
          component = this;
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<button {{action (mut this.label) "Clicked!"}}>{{if this.label this.label "Click me"}}</button>',
      });

      this.render('{{example-component}}');

      this.assertText('Click me');

      this.assertStableRerender();

      runTask(() => {
        this.$('button').click();
      });

      this.assertText('Clicked!');

      runTask(() => {
        component.set('label', 'Dun clicked');
      });

      this.assertText('Dun clicked');

      runTask(() => {
        this.$('button').click();
      });

      this.assertText('Clicked!');

      runTask(() => {
        component.set('label', undefined);
      });

      this.assertText('Click me');
    }

    ['@test it supports non-registered actions [GH#14888]']() {
      this.render(
        `
      {{#if this.show}}
        <button id='ddButton' {{action (mut this.show) false}}>
          Show ({{this.show}})
        </button>
      {{/if}}
    `,
        { show: true }
      );

      this.assert.equal(this.$('button').text().trim(), 'Show (true)');
      // We need to focus in to simulate an actual click.
      runTask(() => {
        document.getElementById('ddButton').focus();
        document.getElementById('ddButton').click();
      });
    }

    ["@test action handler that shifts element attributes doesn't trigger multiple invocations"]() {
      let actionCount = 0;
      let ExampleComponent = Component.extend({
        selected: false,
        actions: {
          toggleSelected() {
            actionCount++;
            this.toggleProperty('selected');
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template:
          '<button class="{{if this.selected \'selected\'}}" {{action "toggleSelected"}}>Toggle Selected</button>',
      });

      this.render('{{example-component}}');

      runTask(() => {
        this.$('button').click();
      });

      this.assert.equal(actionCount, 1, 'Click action only fired once.');
      this.assert.ok(
        this.$('button').hasClass('selected'),
        "Element with action handler has properly updated it's conditional class"
      );

      runTask(() => {
        this.$('button').click();
      });

      this.assert.equal(actionCount, 2, 'Second click action only fired once.');
      this.assert.ok(
        !this.$('button').hasClass('selected'),
        "Element with action handler has properly updated it's conditional class"
      );
    }

    ['@test [DEPRECATED] it should support mouseEnter events']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div id="inner" {{action "show" on="mouseEnter"}}></div>',
      });

      expectDeprecation(
        () => this.render('{{example-component id="outer"}}'),
        'Using the `{{action}}` modifier with `mouseEnter` events has been deprecated.'
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      runTask(() => {
        this.$(outer).trigger('mouseenter', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseover', { relatedTarget: parent });
        this.$(parent).trigger('mouseout', { relatedTarget: inner });
      });

      this.assert.ok(showCalled, 'show action was called on mouseEnter');
    }

    ['@test [DEPRECATED] it should support mouseLeave events']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div id="inner" {{action "show" on="mouseLeave"}}></div>',
      });

      expectDeprecation(
        () => this.render('{{example-component id="outer"}}'),
        'Using the `{{action}}` modifier with `mouseLeave` events has been deprecated.'
      );

      let parent = this.element;
      let outer = this.$('#outer')[0];
      let inner = this.$('#inner')[0];

      runTask(() => {
        this.$(outer).trigger('mouseleave', { canBubble: false, relatedTarget: parent });
        this.$(inner).trigger('mouseout', { relatedTarget: parent });
        this.$(parent).trigger('mouseover', { relatedTarget: inner });
      });

      this.assert.ok(showCalled, 'show action was called on mouseLeave');
    }

    ['@test [DEPRECATED] it should support mouseMove events']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div id="inner" {{action "show" on="mouseMove"}}></div>',
      });

      expectDeprecation(
        () => this.render('{{example-component id="outer"}}'),
        'Using the `{{action}}` modifier with `mouseMove` events has been deprecated.'
      );

      runTask(() => {
        this.$('#inner').trigger('mousemove');
      });

      this.assert.ok(showCalled, 'show action was called on mouseMove');
    }

    ['@test [DEPRECATED] it should support bound mouseMove events']() {
      let showCalled = false;

      let ExampleComponent = Component.extend({
        eventType: 'mouseMove',
        actions: {
          show() {
            showCalled = true;
          },
        },
      });

      this.registerComponent('example-component', {
        ComponentClass: ExampleComponent,
        template: '<div id="inner" {{action "show" on=this.eventType}}></div>',
      });

      expectDeprecation(
        () => this.render('{{example-component id="outer"}}'),
        'Using the `{{action}}` modifier with `mouseMove` events has been deprecated.'
      );

      runTask(() => {
        this.$('#inner').trigger('mousemove');
      });

      this.assert.ok(showCalled, 'show action was called on mouseMove');
    }
  }
);
