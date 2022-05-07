// eslint-disable-next-line max-classes-per-file
import {
  render, waitFor, screen, RenderResult, act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { UserEvent } from '@testing-library/user-event/dist/types/setup';
import {
  AsyncEffectState,
  AsyncState,
  asyncUIBlock, combine,
  flatMap, map,
  Options,
  useAsyncEffectState, useManualAsyncState,
} from '../src';
import waitPromise from '../src/waitPromise';

jest.mock('../src/waitPromise', () => jest.fn());
const mockedWaitPromise = waitPromise as jest.MockedFunction<any>;

describe('useAsyncEffectState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function TestElement(props: {
    asyncFunction: () => Promise<string>,
    nonce?: number,
    options?: Options
  }): any {
    const { asyncFunction, nonce, options } = props;
    const request = useAsyncEffectState(asyncFunction, [nonce], options);

    return (
      <>
        <p>Nonce is {nonce}</p>
        {
          asyncUIBlock(
            request,
            (testString: string) => <p>{testString}</p>,
            (error) => <p>{error.toString()}</p>,
            () => <p>Loading...</p>,
          )
        }
      </>
    );
  }

  class TestFixture {
    totalCallCount = 0;

    options?: Options;

    private blocker: Promise<void>;

    protected renderResult: RenderResult;

    private blockerResolver: (value?: any) => void;

    private blockerRejector: (error: Error) => void;

    constructor(optionsParam?: Options) {
      this.options = optionsParam;
      this.blocker = new Promise((resolve, reject) => {
        this.blockerResolver = resolve;
        this.blockerRejector = reject;
      });
    }

    async asyncFunction() {
      this.totalCallCount += 1;

      await this.blocker;

      this.blocker = new Promise((resolve, reject) => {
        this.blockerResolver = resolve;
        this.blockerRejector = reject;
      });

      return 'Sample string';
    }

    render(nonce: number) {
      this.renderResult = render(<TestElement
        asyncFunction={() => this.asyncFunction()}
        nonce={nonce}
        options={this.options}
      />);
    }

    rerender(nonce: number) {
      this.renderResult.rerender(<TestElement
        asyncFunction={() => this.asyncFunction()}
        nonce={nonce}
        options={this.options}
      />);
    }

    releaseResolver() {
      act(() => this.blockerResolver());
    }

    releaseRejector(err: Error) {
      act(() => this.blockerRejector(err));
    }

    async expectNonceRendered(nonce: number) {
      await waitFor(() => screen.findByText(`Nonce is ${nonce}`));
    }

    async expectTotalCallCount(callCount: number) {
      await waitFor(() => expect(this.totalCallCount).toEqual(callCount));
    }

    async expectLoadingRendered() {
      await waitFor(() => screen.findByText('Loading...'));
    }

    async expectSampleStringRendered() {
      await waitFor(() => screen.findByText('Sample string'));
    }

    async expectTextFound(text: string) {
      await waitFor(() => screen.findByText(text));
    }
  }

  describe('Default config on single render', () => {
    it('should render loading and then render resulting string', async () => {
      const test = new TestFixture();
      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
    });

    it('should render loading and then render error if an error occured', async () => {
      const test = new TestFixture();
      test.render(0);
      await test.expectLoadingRendered();
      test.releaseRejector(new Error('Error'));
      await test.expectTextFound('Error: Error');
    });
  });

  describe('call dedup behaviour', () => {
    it('should remove duplicated async call if previous async call was not resolved', async () => {
      const test = new TestFixture();

      test.render(0);
      await test.expectNonceRendered(0);

      test.rerender(1);
      await test.expectNonceRendered(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      await test.expectTotalCallCount(1);

      test.releaseResolver();

      await test.expectTotalCallCount(2);
      await expect(() => test.expectTotalCallCount(3)).rejects.toThrow();
    });
  });

  describe('call dedup is disabled', () => {
    it('should call async call as many time as props update', async () => {
      const test = new TestFixture({
        disableRequestDedup: true,
      });

      test.render(0);
      await test.expectNonceRendered(0);

      test.rerender(1);
      await test.expectNonceRendered(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      await test.expectTotalCallCount(3);
    });
  });

  describe('noLoadingOnReload option', () => {
    it('should not show loading on second render', async () => {
      const test = new TestFixture({
        noLoadingOnReload: true,
      });

      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
      test.rerender(1);
      await expect(() => test.expectLoadingRendered()).rejects.toThrow();
    });

    it('should show loading on second render by default', async () => {
      const test = new TestFixture();

      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
      test.rerender(1);
      await test.expectLoadingRendered();
    });
  });

  describe('debounced option', () => {
    it('debounce on second render', async () => {
      const test = new TestFixture({
        debounceDelayMs: 1000,
      });

      let timerResolve;
      mockedWaitPromise.mockReturnValue(new Promise((resolve, _) => {
        timerResolve = resolve;
      }));

      test.render(0);
      await test.expectNonceRendered(0);
      expect(mockedWaitPromise.mock.calls.length).toBe(0);

      test.rerender(1);
      await test.expectNonceRendered(1);
      await test.expectTotalCallCount(1);

      act(() => {
        timerResolve();
      });
      test.releaseResolver();

      await test.expectTotalCallCount(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      expect(mockedWaitPromise.mock.calls.length).toBe(2);
      await test.expectTotalCallCount(3);
    });

    it('debounce on every render', async () => {
      const test = new TestFixture({
        debounceDelayMs: 1000,
        debounceOnInitialCall: true,
      });

      let timerResolve;
      mockedWaitPromise.mockReturnValue(new Promise((resolve, _) => {
        timerResolve = resolve;
      }));

      test.render(0);
      await test.expectNonceRendered(0);
      expect(mockedWaitPromise.mock.calls.length).toBe(1);

      test.rerender(1);
      await test.expectNonceRendered(1);

      // Blocked by timer
      await test.expectTotalCallCount(0);

      act(() => {
        timerResolve();
      });
      test.releaseResolver();

      // Blocked by timer
      await test.expectTotalCallCount(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      expect(mockedWaitPromise.mock.calls.length).toBe(3);
      await test.expectTotalCallCount(2);
    });
  });

  describe('useManualAsyncState', () => {
    function ManualTestElement(props: {
      asyncFunction: () => Promise<string>,
      options?: Options
    }): any {
      const { asyncFunction, options } = props;
      const [request, trigger] = useManualAsyncState(asyncFunction, options);

      return (
        <>
          <button type="button" onClick={() => trigger()}>Button</button>
          {
              asyncUIBlock(
                request,
                (testString: string) => <p>{testString}</p>,
                (error) => <p>{error.toString()}</p>,
                () => <p>Loading...</p>,
                () => <p>Pending...</p>,
              )
            }
        </>
      );
    }

    class ManualTestFixture extends TestFixture {
      private user: UserEvent;

      constructor() {
        super();
        this.user = userEvent.setup();
      }

      async asyncFunction() {
        this.totalCallCount += 1;
        return 'Sample string';
      }

      render() {
        this.renderResult = render(<ManualTestElement
          asyncFunction={() => this.asyncFunction()}
        />);
      }

      async clickButton() {
        await this.user.click(await screen.findByText('Button'));
      }

      async expectPendingRendered() {
        await waitFor(() => screen.findByText('Pending...'));
      }
    }

    it('should render pending not render resulting string until triggered', async () => {
      const test = new ManualTestFixture();
      test.render();

      await test.expectPendingRendered();
      await expect(() => test.expectSampleStringRendered()).rejects.toThrow();
      await test.expectTotalCallCount(0);

      await test.clickButton();
      await test.expectLoadingRendered();
      await test.releaseResolver();

      await test.expectTotalCallCount(1);
      await test.expectSampleStringRendered();
    });
  });

  describe('flatMap', () => {
    const loadingState: AsyncEffectState<string> = [AsyncState.LOADING, null, null];
    const errorState: AsyncEffectState<string> = [AsyncState.ERROR, null, null];
    const resolvedState: AsyncEffectState<string> = [AsyncState.RESOLVED, 'input', null];
    const transformedString = 'input-transformed';

    const transformer: (input: string) => AsyncEffectState<string> = (resolvedInput) => [AsyncState.RESOLVED, `${resolvedInput}-transformed`, null];

    it('returns original async state when in loading state', () => {
      expect(flatMap(transformer, loadingState)).toBe(loadingState);
    });

    it('returns original async state when in error state', () => {
      expect(flatMap(transformer, errorState)).toBe(errorState);
    });

    it('returns a resolved state with transformed value when input is resolved', () => {
      const [state, value, error] = flatMap(transformer, resolvedState);

      expect(state).toEqual(AsyncState.RESOLVED);
      expect(value).toEqual(transformedString);
    });
  });

  describe('mapper', () => {
    const loadingState: AsyncEffectState<string> = [AsyncState.LOADING, null, null];
    const errorState: AsyncEffectState<string> = [AsyncState.ERROR, null, null];
    const resolvedState: AsyncEffectState<string> = [AsyncState.RESOLVED, 'input', null];
    const transformedString = 'input-transformed';

    const transformer: (input: string) => string = (resolvedInput) => `${resolvedInput}-transformed`;

    it('returns original async state when in loading state', () => {
      expect(map(transformer, loadingState)).toBe(loadingState);
    });

    it('returns original async state when in error state', () => {
      expect(map(transformer, errorState)).toBe(errorState);
    });

    it('returns a resolved state with transformed value when input is resolved', () => {
      const [state, value, error] = map(transformer, resolvedState);

      expect(state).toEqual(AsyncState.RESOLVED);
      expect(value).toEqual(transformedString);
    });
  });

  describe('combiner', () => {
    const loadingState: AsyncEffectState<string> = [AsyncState.LOADING, null, null];
    const errorState: AsyncEffectState<string> = [AsyncState.ERROR, null, null];
    const resolvedState1: AsyncEffectState<string> = [AsyncState.RESOLVED, 'input1', null];
    const resolvedState2: AsyncEffectState<string> = [AsyncState.RESOLVED, 'input2', null];
    const transformedString = 'input1-input2';

    const transformer: (input1: string, input2) => string = (input1, input2) => `${input1}-${input2}`;

    it('returns non-resolved state when either of the input is not resolved', () => {
      expect(combine(transformer, resolvedState1, loadingState)[0]).toEqual(AsyncState.LOADING);
      expect(combine(transformer, loadingState, resolvedState2)[0]).toEqual(AsyncState.LOADING);
      expect(combine(transformer, resolvedState1, errorState)[0]).toEqual(AsyncState.ERROR);
      expect(combine(transformer, errorState, resolvedState2)[0]).toEqual(AsyncState.ERROR);
      expect(combine(transformer, errorState, loadingState)[0]).toEqual(AsyncState.ERROR);
      expect(combine(transformer, loadingState, errorState)[0]).toEqual(AsyncState.ERROR);
    });

    it('returns a resolved state with transformed value when input is resolved', () => {
      const [state, value, error] = combine(transformer, resolvedState1, resolvedState2);

      expect(state).toEqual(AsyncState.RESOLVED);
      expect(value).toEqual(transformedString);
    });
  });
});
