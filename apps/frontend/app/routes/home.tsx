export default function Home() {
	return (
		<div className="hero min-h-screen bg-base-200">
			<div className="hero-content text-center">
				<div className="max-w-md">
					<h1 className="text-5xl font-bold mb-8">ゲームポータル</h1>
					<div className="card w-96 bg-base-100 shadow-xl">
						<div className="card-body">
							<h2 className="card-title">魔法陣</h2>
							<p>魔法陣を模したゲームです。</p>
							<div className="card-actions justify-end">
								<a href="/magic-square" className="btn btn-primary">
									開始する
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
