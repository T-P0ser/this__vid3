const Twit = require("twit");
const config = require("./config.json");
const getVideoURL = require("./getVideo.js");
const generateVideo = require("./generateVideo.js");
const upload = require("./upload.js");
const fetch = require("node-fetch");
const fs = require("fs-extra");
const client = new Twit({
  consumer_key: config.consumerKey,
  consumer_secret: config.consumerSecret,
  access_token: config.accessToken,
  access_token_secret: config.accessSecret
});

fs.access("./cache/").catch(error => {
  if (error) fs.mkdir("./cache/");
});

const stream = client.stream("statuses/filter", {
  track: `@${config.accountName}`
});

const tweets = [];
const cooldown = [];
let isRateLimited = false;

stream.on("tweet", async (tweet) => {
  if (!isRateLimited) {
    if (tweet.in_reply_to_status_id !== null) {
      try {
        const originalTweet = await client.get("statuses/show", {
          id: tweet.in_reply_to_status_id_str
        });
        if (originalTweet.data.possibly_sensitive !== true) {
          if (!originalTweet.data.text.includes(`@${config.accountName}`) && originalTweet.data.user.screen_name !== `@${config.accountName}`) {
            if (!tweets.includes(originalTweet.data.id_str) && !cooldown.includes(tweet.user.id_str)) {
              const url = await getVideoURL(originalTweet.data, client);
              if (url !== undefined) {
                const videoData = await fetch(url);
                const randomFilename = Math.random().toString(36).substring(2, 15);
                const fileName = `./cache/${tweet.user.screen_name}-${randomFilename}.mp4`;
                const dest = fs.createWriteStream(fileName);
                videoData.body.pipe(dest);
                const outputPath = await generateVideo(fileName, originalTweet.data.user.screen_name);
                const uploadData = await upload(outputPath, client);
                console.log(`Successfully uploaded video with media ID ${uploadData.data.media_id_string}`);
                console.log(`Response: ${uploadData.response.statusCode} ${uploadData.response.statusMessage}`);

                await fs.remove(fileName);
                await fs.remove(outputPath);

                tweets.push(originalTweet.data.id_str);
                cooldown.push(tweet.user.id_str);
                setTimeout(async () => {
                  cooldown.filter((value) => {
                    return value !== tweet.user.id_str;
                  });
                }, 1800000);

                const messages = [
                  "Downloaded!",
                  "Here's your video!",
                  "Take a look, y'all:",
                  "Check it out:",
                  "Done!",
                  "Download complete!",
                  "Uploaded!",
				  "Here you go!",
				  "I got it!",
				  "Easy!",
				  "I'm here!",
				  "Don't Worry! =)",
				  "Gotcha!",
				  "Like this?",
				  "Beep boop",
				  "Sure thing!",
				  "Got it boss!",
                  "Sorted. 👍",
                  "I got it!",
				  `Your video, @${tweet.user.screen_name} sir!`,
                  `Your video has been downloaded, @${tweet.user.screen_name}!`,
                  "Finished!"
                ];
                const tweetContent = `@${tweet.user.screen_name} ${messages[Math.floor(Math.random() * messages.length)]}`;
                const payload = {
                  status: tweetContent,
                  in_reply_to_status_id: tweet.id_str,
                  media_ids: [uploadData.data.media_id_string]
                };
                client.post("statuses/update", payload, (error, result, response) => {
                  if (error) console.error;
                  if (response.statusCode === 403) {
                    isRateLimited = true;
                    console.log("Twitter rate limited us (again), restarting in 30 minutes");
                    setTimeout(() => {
                      isRateLimited = false;
                    }, 7200000);
                  } else {
                    console.log(`Reply with id ${result.id_str} has been posted with status code ${response.statusCode} ${response.statusMessage}!`);
                  }
                });
              } else {
                console.log("Video not found");
              }
            } else {
              console.log("Already processed this tweet or user is on cooldown, skip");
            }
          } else {
            console.log("Not replying to self");
          }
        } else {
          console.log("Might contain NSFW content, skip");
        }
      } catch (e) {
        const error = JSON.stringify(e);
        if (error.includes("Sorry, you are not authorized to see this status.")) {
          console.log("Private account or original poster blocked, skip");
        } else if (error.includes("Segments do not add up to provided total file size.")) {
          console.log("Video failed to upload, skip");
        } else if (error.includes("You have been blocked from the author of this tweet.")) {
          console.log("Blocked by original poster, skip");
        } else if (error.includes("Error while processing the decoded data for stream #2:0")) {
          console.log("Content is gif, skip");
        } else {
          console.error;
        }
      }
    } else {
      console.log("Tweet not replying to anything, skip");
    }
  }
});
