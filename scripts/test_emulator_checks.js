(async () => {
  const endpoint = 'http://127.0.0.1:5001/learnup-3cdb7/us-central1/submitAnswer';
  const firestoreBase = 'http://127.0.0.1:8088/v1/projects/learnup-3cdb7/databases/(default)/documents';

  async function post(body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { console.log('Non-JSON response:', text); }
    console.log('\nPOST', JSON.stringify(body));
    console.log('HTTP', res.status);
    console.log('RESPONSE', JSON.stringify(json, null, 2));
    return json;
  }

  async function getDoc(path) {
    const url = `${firestoreBase}/${path}`;
    const r = await fetch(url);
    const t = await r.text();
    try { return JSON.parse(t); } catch (e) { return t; }
  }

  try {
    console.log('=== Running 4 correct answers to trigger mastery level-up ===');
    for (let i=1;i<=4;i++) {
      const body = { userId: 'test-user-1', topic: 'Geography', isCorrect: true, solvedQuestionIds: [] };
      const result = await post(body);
      console.log('Mastery after op:', result?.mastery);
    }

    console.log('\n=== Fetch learningStats and user topicMastery from Firestore emulator ===');
    const statsDoc = await getDoc('users/test-user-1/learningStats/main');
    console.log('learningStats document:', JSON.stringify(statsDoc, null, 2));
    const userDoc = await getDoc('users/test-user-1');
    console.log('user document:', JSON.stringify(userDoc, null, 2));

    console.log('\n=== Trigger mock AI generation (mockGenerate=true) ===');
    const genResp = await post({ userId: 'test-user-1', topic: 'Geography', isCorrect: null, solvedQuestionIds: [], mockGenerate: true });
    console.log('Generated nextQuestion:', JSON.stringify(genResp?.nextQuestion, null, 2));

    if (genResp && genResp.nextQuestion && genResp.nextQuestion.id) {
      const qdoc = await getDoc(`questions/${genResp.nextQuestion.id}`);
      console.log('Saved question doc from Firestore:', JSON.stringify(qdoc, null, 2));
    }

    console.log('\n=== Done ===');
  } catch (err) {
    console.error('Test script error:', err);
    process.exitCode = 2;
  }
})();
