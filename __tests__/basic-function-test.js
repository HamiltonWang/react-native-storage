import Storage from '../src/storage';
import { NotFoundError, ExpiredError } from '../src/error';
const SIZE = 10,
  DEFAULTEXPIRES = 1000 * 3600;

const localStorage = new Storage({
  size: SIZE,
  defaultExpires: DEFAULTEXPIRES,
  storageBackend: global.localStorage,
});
const asyncStorage = new Storage({
  size: SIZE,
  defaultExpires: DEFAULTEXPIRES,
  storageBackend: global.asyncStorage,
});
const stores = { localStorage, asyncStorage };

beforeEach(() => {
  localStorage.clearAll();
  asyncStorage.clearAll();
});

describe('react-native-storage: basic function', () => {
  Object.keys(stores).map(storageKey => {
    let storage = stores[storageKey];
    test('accepts parameters in constructor' + `(${storageKey})`, () => {
      expect(storage._SIZE).toBe(SIZE);
      expect(storage.defaultExpires).toBe(DEFAULTEXPIRES);
    });
    test('saves and loads any type of data' + `(${storageKey})`, () => {
      let testCases = {
        testNumber: 11221,
        testString: 'testString',
        testObject: {
          fname: 'foo',
          lname: 'bar',
        },
        testArray: ['one', 'two', 'three'],
        testBoolean: false,
        testNull: null,
        complexObject: {
          complexArray: [1, 2, 3, 'test', { a: 'b' }],
        },
      };
      let returnCases = {},
        returnCasesWithId = {};
      let tasks = [];
      for (let key in testCases) {
        tasks.push(
          storage
            .save({
              key,
              data: testCases[key],
            })
            .then(() =>
              storage
                .load({
                  key,
                })
                .then(ret => {
                  returnCases[key] = ret;
                }),
            ),
        );
        tasks.push(
          storage
            .save({
              key,
              id: 1,
              data: testCases[key],
            })
            .then(() =>
              storage
                .load({
                  key,
                  id: 1,
                })
                .then(ret => {
                  returnCasesWithId[key] = ret;
                }),
            ),
        );
      }
      return Promise.all(tasks).then(() => {
        for (let key in testCases) {
          expect(JSON.stringify(testCases[key])).toBe(JSON.stringify(returnCases[key]));
          expect(JSON.stringify(testCases[key])).toBe(JSON.stringify(returnCasesWithId[key]));
        }
      });
    });
    test('rejects when no data found and no sync method' + `(${storageKey})`, () => {
      let testKey1 = 'testKey' + Math.random(),
        testKey2 = 'testKey' + Math.random(),
        testId2 = 'testId' + Math.random();
      let ret1, ret2, error1, error2;
      let tasks = [
        storage
          .load({
            key: testKey1,
          })
          .then(ret => {
            ret1 = ret;
          })
          .catch(e => {
            error1 = e;
          }),
        storage
          .load({
            key: testKey2,
            id: testId2,
          })
          .then(ret => {
            ret2 = ret;
          })
          .catch(e => {
            error2 = e;
          }),
      ];
      return Promise.all(tasks).then(() => {
        expect(ret1).toBeUndefined();
        expect(ret2).toBeUndefined();
        expect(error1.name).toBe('NotFoundError');
        expect(error2.name).toBe('NotFoundError');
      });
    });

    test('rejects when data expired and no sync method' + `(${storageKey})`, () => {
      let originDateNow = Date.now;
      let starttime = 0;
      Date.now = jest.fn(() => {
        return (starttime += 100);
      });
      let testKey1 = 'testKey' + Math.random(),
        testKey2 = 'testKey' + Math.random(),
        testId2 = 'testId' + Math.random(),
        testData1 = 'testData1' + Math.random(),
        testData2 = 'testData2' + Math.random();
      let ret1, ret2, error1, error2;
      let tasks = [
        storage
          .save({
            key: testKey1,
            data: testData1,
            expires: 1,
          })
          .then(() =>
            storage.load({
              key: testKey1,
            }),
          )
          .then(ret => {
            ret1 = ret;
          })
          .catch(e => {
            error1 = e;
          }),
        storage
          .save({
            key: testKey2,
            id: testId2,
            data: testData2,
            expires: 1,
          })
          .then(() =>
            storage.load({
              key: testKey2,
              id: testId2,
            }),
          )
          .then(ret => {
            ret2 = ret;
          })
          .catch(e => {
            error2 = e;
          }),
      ];
      return Promise.all(tasks).then(() => {
        expect(ret1).toBeUndefined();
        expect(ret2).toBeUndefined();
        expect(error1.name).toBe('ExpiredError');
        expect(error2.name).toBe('ExpiredError');
        Date.now = originDateNow;
      });
    });
    test('overwrites "key+id" data when loops over(exceeds SIZE)', async () => {
      let testKey = 'testKey' + Math.random(),
        testId = 'testId' + Math.random(),
        testData = 'testData' + Math.random();
      let ret1, ret2, cursorIndex1, cursorIndex2;

      cursorIndex1 = storage._m.index; // 0

      await storage.save({
        key: testKey,
        id: testId,
        data: testData,
      });

      for (let i = 0; i < SIZE - 1; i++) {
        await storage.save({
          key: 'testKey' + Math.random(),
          id: 'testId' + Math.random(),
          data: 'testData' + Math.random(),
        });
      }

      cursorIndex2 = storage._m.index; // 0 again

      // not overwrited yet
      ret1 = await storage.load({
        key: testKey,
        id: testId,
      });

      // overwrite
      await storage.save({
        key: 'testKey' + Math.random(),
        id: 'testId' + Math.random(),
        data: 'testData' + Math.random(),
      });

      try {
        ret2 = await storage.load({
          key: testKey,
          id: testId,
        });
      } catch (e) {
        ret2 = e;
      }

      expect(cursorIndex1).toBe(cursorIndex2);
      expect(ret1).toBe(testData);
      expect(ret2 instanceof NotFoundError).toBeTruthy();
    });

    test('overwrites "key+id" data when exceeds SIZE with the same key', async () => {
      const testKey = 'testKey';
      let cursorIndex1, cursorIndex2, results;

      cursorIndex1 = storage._m.index;
      results = [];
      for (let i = 0; i < SIZE; i++) {
        const mockData = 'data' + i;
        results.push(mockData);
        await storage.save({
          key: testKey,
          id: 'testId' + i,
          data: mockData,
        });
      }

      // not overwrited yet
      expect(JSON.stringify(await storage.getAllDataForKey(testKey))).toBe(JSON.stringify(results));

      cursorIndex2 = storage._m.index; // 0 again

      // overwrite
      const mockData = 'data-overwrite';
      results.splice(0, 1);
      results.push(mockData);
      await storage.save({
        key: 'testKey',
        id: 'testId' + SIZE,
        data: mockData,
      });

      expect(JSON.stringify(await storage.getAllDataForKey(testKey))).toBe(JSON.stringify(results));

      expect(cursorIndex1).toBe(cursorIndex2);
    });

    test('removes data correctly' + `(${storageKey})`, () => {
      let testKey1 = 'testKey1' + Math.random(),
        testKey2 = 'testKey2' + Math.random(),
        testId2 = 'testId2' + Math.random(),
        testData1 = 'testData1' + Math.random(),
        testData2 = 'testData2' + Math.random();
      let ret1 = [undefined, undefined],
        ret2 = [undefined, undefined];
      let task = (key, id, data, retArray) => {
        return storage
          .save({
            key,
            id,
            data,
          })
          .then(() => {
            return storage.load({
              key,
              id,
            });
          })
          .then(ret => {
            retArray[0] = ret;
            return storage.remove({ key, id });
          })
          .then(() => {
            return storage.load({ key, id });
          })
          .then(ret => {
            retArray[1] = ret;
          })
          .catch(() => {
            retArray[1] = 'catched';
          });
      };
      return Promise.all([task(testKey1, undefined, testData1, ret1), task(testKey2, testId2, testData2, ret2)]).then(
        () => {
          expect(ret1[0]).toBe(testData1);
          expect(ret1[1]).toBe('catched');
          expect(ret2[0]).toBe(testData2);
          expect(ret2[1]).toBe('catched');
        },
      );
    });

    test('gets all data for key correctly' + `(${storageKey})`, () => {
      let key = 'testKey' + Math.random(),
        testIds = [Math.random(), Math.random(), Math.random()],
        testDatas = [Math.random(), Math.random(), Math.random()];
      return Promise.all(
        testIds.map((id, i) =>
          storage.save({
            key,
            id,
            data: testDatas[i],
          }),
        ),
      )
        .then(() => {
          return storage.getAllDataForKey(key);
        })
        .then(realRet => {
          expect(realRet).toEqual(testDatas);
        });
    });

    test('removes all data for key correctly' + `(${storageKey})`, () => {
      let key = 'testKey' + Math.random(),
        testIds = [Math.random(), Math.random(), Math.random()],
        testDatas = [Math.random(), Math.random(), Math.random()];
      let ret;
      return Promise.all(
        testIds.map((id, i) =>
          storage.save({
            key,
            id,
            data: testDatas[i],
          }),
        ),
      )
        .then(() => {
          return storage.clearMapForKey(key);
        })
        .then(() => {
          return storage.getAllDataForKey(key);
        })
        .then(realRet => {
          ret = realRet;
        })
        .catch(() => {
          ret = undefined;
        })
        .then(() => {
          expect(Array.isArray(ret)).toBe(true);
          expect(ret.length).toBe(0);
        });
    });

    test('loads ids by key correctly' + `(${storageKey})`, () => {
      let key = 'testKey' + Math.random(),
        testIds = [Math.random(), Math.random(), Math.random()],
        data = 'testData' + Math.random();
      let ret = [];
      let tasks = testIds.map(id =>
        storage.save({
          key,
          id,
          data,
        }),
      );
      return Promise.all(tasks).then(() => {
        expect(storage.getIdsForKey(key)).toEqual(testIds);
      });
    });
  });
});
