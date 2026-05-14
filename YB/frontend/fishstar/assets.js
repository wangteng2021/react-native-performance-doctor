const PACKAGE_ROOT = "https://game-center-test.jieyou.shop/game-packages/common-web/fishing/3.5.3/web-mobile";
const RESOURCES_ROOT = `${PACKAGE_ROOT}/assets/resources/native`;

export const packageBase = PACKAGE_ROOT;

export const originalAssets = {
  root: packageBase,
  originalEntry: `${packageBase}/index.html`,
  background: `${PACKAGE_ROOT}/bigbg.1d9fd.jpg`,
  loadingGif: `${PACKAGE_ROOT}/loading.08f4a.gif`,
  loadingTexture: `${RESOURCES_ROOT}/97/973e85cd-9650-4add-a512-62fe81328d6b.ece9b.png`,
  button: `${RESOURCES_ROOT}/93/93ebf451-4efb-4cc3-9bae-a2962a39b826.9b648.png`,
  coin: `${RESOURCES_ROOT}/36/36ef725b-40e7-42a6-97cc-543f4e4bbe01.665e0.png`,
  coinButton: `${RESOURCES_ROOT}/62/62f3009c-5bd6-4dad-93d7-b1ed0c5e4d23.d3172.png`,
  purpleCoin: `${RESOURCES_ROOT}/69/69ffc68e-a2ef-4012-b978-aff7bc95b22e.21363.png`,
  purpleCoinButton: `${RESOURCES_ROOT}/83/8350d2fc-0322-45e1-aacf-ed214130c1c0.a0df3.png`,
  cannon: `${RESOURCES_ROOT}/a6/a60a9ac2-ea10-400d-8adf-243ab49f7a86.fa30b.png`,
  audio: {
    music: `${RESOURCES_ROOT}/2a/2a40fa4b-bc88-4345-8e2e-fd66ec50a62d.7fa0b.mp3`,
    shot: `${RESOURCES_ROOT}/5f/5f42d20a-6f29-42b7-8b3b-21d4e2427971.60d37.mp3`,
    hit: `${RESOURCES_ROOT}/42/42f274e1-0e44-419e-a8a0-042bd0cf1a59.f5438.mp3`,
    coin: `${RESOURCES_ROOT}/41/419dbcef-6489-4894-8b31-cc916a75d6a5.b222a.mp3`,
    miss: `${RESOURCES_ROOT}/01/01254d71-2fb1-4eb5-afcd-266ea5acbc00.2c533.mp3`,
    button: `${RESOURCES_ROOT}/23/237b4a95-5d58-418b-99ed-dacc2cf9d474.17cb3.mp3`
  }
};

export const fishTextures = [
  { id: "fish_10001", name: "fish_10001", src: `${RESOURCES_ROOT}/00/0070b0e6-0ef1-41be-9ef5-93fb667400d4.73ffc.png`, value: 1.0 },
  { id: "fish_20003", name: "fish_20003", src: `${RESOURCES_ROOT}/03/0367899c-736d-4728-91c8-e6786f344b75.b5c97.png`, value: 1.4 },
  { id: "fish_10003", name: "fish_10003", src: `${RESOURCES_ROOT}/57/576e4e6e-ba3b-4396-bf5c-8feafd270be7.5309f.png`, value: 1.7 },
  { id: "fish_10002", name: "fish_10002", src: `${RESOURCES_ROOT}/6a/6aa5577c-f18d-4b18-ab2f-fed664cde461.3cbcf.png`, value: 2.0 },
  { id: "fish_30002", name: "fish_30002", src: `${RESOURCES_ROOT}/7e/7ef2ad51-87b6-4629-bfa2-26f37e93383f.8ba50.png`, value: 2.8 },
  { id: "fish_10004", name: "fish_10004", src: `${RESOURCES_ROOT}/89/8979c2dd-df80-4192-9892-c9348bc3ac74.31087.png`, value: 3.2 },
  { id: "fish_20007", name: "fish_20007", src: `${RESOURCES_ROOT}/c6/c67c7010-5ab0-4487-a306-b10bb59381ab.6340c.png`, value: 4.0 },
  { id: "fish_20002", name: "fish_20002", src: `${RESOURCES_ROOT}/d3/d3336807-5087-47b8-afa0-68d714478c11.a4cc0.png`, value: 4.8 },
  { id: "fish_30003", name: "fish_30003", src: `${RESOURCES_ROOT}/d8/d8cf22f8-a56b-4f4b-bf21-a9cfa6624c77.dba25.png`, value: 5.5 },
  { id: "fish407", name: "fish407", src: `${RESOURCES_ROOT}/e9/e9789a16-d351-48b3-81e6-7c988a3eab57.71988.png`, value: 6.5 },
  { id: "fish_40002", name: "fish_40002", src: `${RESOURCES_ROOT}/ec/ec73d454-b1f6-4c3c-8127-5530011a8166.fa47a.png`, value: 8.0 }
];

export const betSteps = [20, 50, 100, 200, 500, 1000];
