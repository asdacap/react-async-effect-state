import * as React from 'react';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from 'react-dom';

import { useState } from 'react';
import { asyncUIBlock, useAsyncEffectState, Options } from '../src';
import waitPromise from '../src/waitPromise';

function Clicker(props: { options: Options }) {
  const { options } = props;
  const [clickCount, setClickCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const request = useAsyncEffectState(async () => {
    setRequestCount((c) => c + 1);
    await waitPromise(500);
    return `Request from click count ${clickCount}`;
  }, [clickCount], options);

  return (
    <>
      {asyncUIBlock(
        request,
        (text: string) => (<p>{text}</p>),
        (error) => (<p>{error.toString()}</p>),
        () => (<p>Loading...</p>),
      )}
      <button type="button" onClick={() => setClickCount((c) => c + 1)}>
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
      <Clicker options={{ noLoadingOnReload: true, debounceDelayMs: 1000, debounceOnInitialCall: true }} />
    </>
  );
}

ReactDOM.render(
  <MainPage />,
  document.getElementById('root'),
);
