// The frame lane's harness answers (Lane D). Craft-only: the page's own fixtures, no model.
//   fresh 1   a fresh profile: no take yet and no ballot kept, so the first run and the Sample show
export async function answer(path, options, { params, home }) {
  if (path === 'home' && params.get('fresh')) {
    const h = home()
    return { ...h, last_take: null, ballots: 0, transcripts_kept: 0, extemp_round: null, next_drill: null }
  }
  return undefined
}
