import * as React from 'react';
import { useState } from 'react';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from 'react-dom';
import {
  AsyncState, asyncUIBlock, Options, useAsyncEffectState, useManualAsyncState,
} from '../src';
import waitPromise from '../src/waitPromise';

function Clicker(props: { options: Options, manual?: boolean, noRetrigger?: boolean }) {
  const { options, manual, noRetrigger } = props;
  const [clickCount, setClickCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  const asyncClosure = async () => {
    setRequestCount((c) => c + 1);
    await waitPromise(500);
    return `Request from click count ${clickCount}`;
  };

  const [request, trigger] = manual
    ? useManualAsyncState(asyncClosure, options)
    : [useAsyncEffectState(asyncClosure, [clickCount], options), () => {}];

  const onButtonClick = () => {
    if (noRetrigger && request[0] !== AsyncState.PENDING) {
      return;
    }
    setClickCount((c) => c + 1);
    // Well, the state in trigger will be off by one, because by the time it was called,
    // this clickCount would not have been incremented yet.
    trigger();
  };

  return (
    <>
      {asyncUIBlock(
        request,
        (text: string) => (<p>{text}</p>),
        (error) => (<p>{error.toString()}</p>),
        () => (<p>Loading...</p>),
        () => (<p>Pending...</p>),
      )}
      <button type="button" onClick={onButtonClick}>
        Click count {clickCount}, Request count {requestCount}
      </button>
    </>
  );
}

function MainPage() {
  return (
    <>
      <h1>Default config</h1>
      <Clicker options={{}} />
      <h1>No loading on reload</h1>
      <Clicker options={{ noLoadingOnReload: true }} />
      <h1>No loading on reload, update on all call</h1>
      <Clicker options={{ noLoadingOnReload: true, updateStateOnAllCall: true }} />
      <h1>No loading on reload, update on all call, disable request dedup</h1>
      <Clicker options={{
        noLoadingOnReload: true,
        updateStateOnAllCall: true,
        disableRequestDedup: true,
      }}
      />
      <h1>1s debounce</h1>
      <Clicker options={{ debounceDelayMs: 1000 }} />
      <h1>No loading on reload, 1s debounce</h1>
      <Clicker options={{ noLoadingOnReload: true, debounceDelayMs: 1000 }} />
      <h1>No loading on reload, 1s debounce, debounce on initial call</h1>
      <Clicker options={{
        noLoadingOnReload: true,
        debounceDelayMs: 1000,
        debounceOnInitialCall: true,
      }}
      />

      <h1>Manual Clicker</h1>
      <Clicker options={{}} manual />
      <h1>Manual Clicker Without Re-Trigger</h1>
      <Clicker options={{}} manual noRetrigger />
      <h1>Manual Clicker With No Initial Loading</h1>
      <Clicker options={{ initiallyPending: false }} manual />
    </>
  );
}

ReactDOM.render(
  <MainPage />,
  document.getElementById('root'),
);
