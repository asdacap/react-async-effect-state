# React Async Effect State

Encapsulate setting states from async request in React. Also, have some scope creep which includes
debouncing logic and manual trigger.

Usually on a React component that need to get data from an async call (eg: API call), the call is
requested in a `useEffect` block, which then set some state on various lifecycle of the call.
Including some error handling, this would look like this:

```javascript
const [requestState, setRequestState] = useState(["loading", null, null]);
const [status, response, error] = requestState;

useEffect(() => {
    fetch('http://example.com')
        .then((data) => {
            setRequestState(["done", data, null]);
        })
        .catch((error) => {
            setRequestState(["error", null, error]);
        })
}, [])

if (status === "loading") {
    return (<p>Loading data...</p>);
}
if (status === "error") {
    return (<p>An error occured {error.toString()}</p>);
}

return (<p>{response}</p>);
```

This library reduce this to:

```javascript
import { useAsyncEffectState } from 'react-async-effect-state';

const [status, response, error] = useAsyncEffectState(
    () => fetch('http://example.com'), []);

if (status === AsyncState.LOADING) {
    return (<p>Loading data...</p>);
}
if (status === AsyncState.ERROR) {
    return (<p>An error occured {error.toString()}</p>);
}

return (<p>{response}</p>);
```

or if you prefer:

```javascript
import { useAsyncEffectState, asyncUIBlock } from 'react-async-effect-state';

const responseAsync = useAsyncEffectState(
    () => fetch('http://example.com'), []);

return asyncUIBlock(responseAsync,
    (response) => (<p>{response}</p>),
    (error) => (<p>An error occured {error.toString()}</p>),
    () => (<p>Loading data...</p>)
);
```

### Debounce

Occasionally, you'll encounter a situation where you need a search box and you don't want the call
to be triggered on every key press. By default this library only queue one call, and only one call
is running at a time. Therefore, new request for the key will be triggered only after previous call
complete. But you can also specify a debounce duration so that a call will not start until after 
some delay and no other new call is queued (user stopped entering key). For example:

```javascript
import { useAsyncEffectState } from 'react-async-effect-state';

const [query, setQuery] = useState('');
const [status, response, error] = useAsyncEffectState(
    () => fetch('http://example.com&q=' + query),
    [query],
    {
        debounceDelayMs: 300   
    });

if (status === AsyncState.LOADING) {
    return (<p>Loading data...</p>);
}
if (status === AsyncState.ERROR) {
    return (<p>An error occured {error.toString()}</p>);
}

return (<>
    <input value={query} onChange={(e) => setQuery(e.target.value)} />
    <p>{response}</p>
</>);
```

### Manual trigger

If you need to trigger the call manually, you can use a different variant, `useManualAsyncState`
which returns a trigger and reset method.

```javascript
import { useAsyncEffectState } from 'react-async-effect-state';

const [asyncState, trigger, reset] = useManualAsyncstate(
    () => fetch('http://example.com'));
const [status, response, error] = asyncState;

if (status === AsyncState.PENDING) {
    return (<>
        <p>No call yet</p>
        <button onClick={trigger}>Start</button>
    </>);
}
if (status === AsyncState.LOADING) {
    return (<p>Loading data...</p>);
}
if (status === AsyncState.ERROR) {
    return (<p>An error occured {error.toString()}</p>);
}

return (<>
    <p>{response}</p>
    <button onClick={reset}>Reset to pending</button>
</>);
```

## Usage

### `useAsyncEffectState<T>(closure: () => Promise<T>, dependencyList: DependencyList, options: Options) => AsyncEffectState<T>`

Encapsulate setting states from async request. The third parameter is an option object that can
alter some behaviour. Returns a tuple of type `[status,response,error]` which is the current state
of the request.

```typescript
export interface Options {
    /**
     * By default on subsequent async call, the state will switch back to loading state. Set to true
     * to disable this and skip directly to final state then the async call resolve.
     */
    noLoadingOnReload?: boolean;

    /**
     * By default on subsequent useEffect closure call, (it's dependency was updated so it was
     * called), when previous async call was not completed, new call will only gets executed after
     * previous async call completed. Any repeated calls will be removed, meaning only one final
     * call will get executed. This is done to reduce the number of async call, which usually invoke
     * some APIs on response to some user input.
     */
    disableRequestDedup?: boolean;

    /**
     * By default the async state is updated only if there are no additional pending call. Set to true
     * to change that.
     */
    updateStateOnAllCall?: boolean;

    /**
     * Delay execution of async call by this amount. If another call was pending before the async
     * call, the async call is not run in favour of later queued call.
     */
    debounceDelayMs?: number;

    /**
     * By default, debounce start on additional call when a current call is running. This is to improve
     * user feedback in case only one request is required. Set this to true to delay even the first
     * call.
     */
    debounceOnInitialCall?: boolean;

    /**
     * By default, initially the state is AsyncState.LOADING. This is because for most use case,
     * data is loaded at the start. But when using `useManualAsyncState`, a separate state for before
     * the trigger is called is probably desired, in which case, this flag is turned on by default.
     */
    initiallyPending?: boolean;
    
}
```

### `asyncUIBlock<T>(AsyncEffectState<T>, onResolve: (T) => React.ReactNode, onReject: (Error) => React.ReactNode, onLoading?: () => React.ReactNode, onPending?: () => React.ReactNode) => React.ReactNode` 

A small syntactical sugar that runs one of the three closure and returns its response 
depending on the current request state. On loading and on pending is optional and will return
undefined if not specified.

### `useManualAsyncState<T>(closure: () => Promise<T>, options: Options) => [AsyncEffectState<T>, () => () => void, () => void]`

Behave the same as `useAsyncEffectState`, but the async call must be triggered manually via the 
second return value. Useful when the async call needs to be triggered by a button, for example:

```javascript
import { useManualAsyncState, asyncUIBlock } from 'react-async-effect-state';

const [responseAsync, trigger, reset] = useManualAsyncState(
    () => fetch('http://example.com'), []);

return asyncUIBlock(responseAsync,
    (response) => (<p>{response} <button onClick={reset}>Reset</button></p>),
    (error) => (<p>An error occured {error.toString()} <button onClick={trigger}>Retry</button></p>),
    () => (<p>Loading data...</p>),
    () => (<p>No call yet... <button onClick={trigger}>Actually start loading</button></p>),
);
```

The trigger function returns another function that can be used to cancel state change when the
call is complete. This is useful in a `useEffect` call.

The third return value is a reset function for changing the state back to pending.

Note that, it is your responsibility to prevent `trigger` from being called more than once if that
is your intention.

Also, with `debounceOnInitialCall` off, usually async call will be called immediately, so if
you change some state, and immediately call trigger, then the async call closure will not get the
updated state.

### `map<T,U>(mapper: (T) => U, input: AsyncEffectState<T>) => AsyncEfectState<U>`

Simple synchronous mapper for an `AsyncEffectState` which only map the result when the state is
resolved. Useful for transforming the data without using the async function passed in the
useAsyncEffectState which depending on youar use case will probably require another http call.

### `flatMap<T,U>(mapper: (T) => AsyncEffectState<U>, input: AsyncEffectState<T>) => AsyncEfectState<U>`

Map the input state if resolved through a mapper. The mapper should itself returns an
`AsyncEffectState<U>`. Note that the mapper runs conditionally, meaning it can't have React's
`useState` or any other use* calls including `useAsyncEffectState` which uses `useState` and
`useEffect` internally. It can however, return another `AsyncEffectState<U>` from it's closure.

### `combine<T1, T2, U>(combiner: (T1, T2) => U, input1: AsyncEffectState<T1>, input2: AsyncEFfectState<T2>) => AsyncEffectState<U>`

Synchronously combine two `AsyncEffectState` into one. Only runs if both input is resolved. Otherwise,
it will return the first errored input, followed by the first loading input.

### License

MIT © Muhammad Amirul Ashraf