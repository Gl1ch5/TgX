// Mock Data imitating Telegram channels feed and expanded post comments
const mockData = {
    currentUser: {
        id: "u1",
        username: "Alex_TeleX",
        name: "Alex",
        avatar: "https://ui-avatars.com/api/?name=Alex&background=random"
    },
    channels: [
        {
            id: "c1",
            name: "Durov's Channel",
            username: "durov",
            avatar: "https://ui-avatars.com/api/?name=DC&background=3390ec&color=fff",
            subscribers: "2.5M",
            description: "Official channel of Pavel Durov."
        },
        {
            id: "c2",
            name: "Tech News",
            username: "technews",
            avatar: "https://ui-avatars.com/api/?name=TN&background=e17076&color=fff",
            subscribers: "120K",
            description: "Latest updates in technology."
        },
        {
            id: "c3",
            name: "HedgieMarkets",
            username: "HedgieMarkets",
            avatar: "https://ui-avatars.com/api/?name=HM&background=random",
            subscribers: "30K",
            description: "Markets & Economics."
        }
    ],
    posts: [
        {
            id: "p1",
            channelId: "c1",
            text: "Today we are launching a new update for Telegram. It includes many requested features such as... \n\nWe've also significantly improved the performance of the Android app.",
            timestamp: "10:45 AM",
            date: "14 Mar",
            views: "1.2M",
            reactions: [
                { type: "like", count: 12500, active: false },
                { type: "heart", count: 3200, active: false },
                { type: "fire", count: 850, active: false }
            ],
            commentsCount: 345,
            sharesCount: 1200
        },
        {
            id: "p2",
            channelId: "c3",
            text: "That's actually really solid advice. Having AI summarize terms of service before you agree is one of the few genuinely useful applications. The irony is...",
            timestamp: "09:08 AM",
            date: "04 Mar",
            views: "3.6M",
            reactions: [
                { type: "like", count: 26100, active: true },
                { type: "heart", count: 4200, active: false }
            ],
            commentsCount: 1088, // Quotes/Comments
            sharesCount: 9661
        },
        {
            id: "p3",
            channelId: "c2",
            text: "Apple announces its new M4 chip with incredible performance gains. Expect it in the new iPad Pro line coming next month. #AppleEvent",
            timestamp: "Yesterday",
            date: "13 Mar",
            views: "89K",
            reactions: [
                { type: "fire", count: 1200, active: false },
                { type: "mindblown", count: 450, active: false }
            ],
            commentsCount: 89,
            sharesCount: 320
        }
    ],
    comments: {
        "p2": [
            {
                id: "com1",
                userId: "u2",
                username: "DontFe...",
                name: "Ryan • Web AI",
                verified: true,
                avatar: "https://ui-avatars.com/api/?name=Ryan&background=random",
                text: "Here's a helpful tip. No one reads privacy policies and terms of service - they are too long and boring. But please at least have AI review them and flag any concerns for you. I often have AI compare privacy policies of different products.",
                timestamp: "3 days ago",
                reactions: [
                    { type: "like", count: 969, active: false }
                ],
                repliesCount: 20,
                sharesCount: 106,
                views: "94.4K"
            }
        ]
    }
};

window.mockData = mockData;
