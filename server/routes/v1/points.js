import _import from "../../commons/import";

const express = require('express')
const router = express.Router()
const util = require('util')
const pointSv = require("../../services/pointService")
const notifySv = require("../../services/notifyService");


const minChargePoints = 1 * Math.pow(10, 3);
const maxChargePoints = 1 * Math.pow(10, 6);
const dailyChargeMaxPoints = 1 * Math.pow(10, 6);

const minSponsorPoints = 1 * Math.pow(10, 3);
const maxSponsorPoints = 1 * Math.pow(10, 6);
const dailySponsorMaxPoints = 1 * Math.pow(10, 6);

const minAdjustmentPoints = 5 * Math.pow(10, 3);

router.post("/apply", async (req, res) => {

    let body = req.body;
    let uid = req.uinfo["u"];
    let msg = `possible between ${_util.commaMoney(minChargePoints)} and ${_util.commaMoney(maxChargePoints)}`;

    let chargeLimit = {
        min: minChargePoints,
        max: maxChargePoints
    }

    let result;

    if (!_util.hasKeys(body, "point_quantity")) {
        // console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (!_util.isBeyondZero(body.point_quantity)) {
        // console.log("not num");
        return res.send(jresp.invalidData());
    }

    if (Number(body.point_quantity) < minChargePoints) {
        // console.log("invalid price");
        return res.send(jresp.invalidData(msg, chargeLimit));
    }

    if (Number(body.point_quantity) > maxChargePoints) {
        // console.log("invalid price");
        return res.send(jresp.invalidData(msg, chargeLimit));
    }

    let dailyCharged = await pointSv.getDailyChargePointsByUserId(uid);
    let possibleDailyCharge = dailyChargeMaxPoints - dailyCharged;

    // console.log(possibleDailyCharge);

    if (Number(body.point_quantity) > possibleDailyCharge) {
        // console.log("invalid price");

        let data = {
            "daily_charge_limit": dailyChargeMaxPoints,
            "possible_charge": possibleDailyCharge
        }

        return res.send(jresp.beyondSomething("beyond daily charge", data))
    }

    body.user_id = uid;

    result = await pointSv.applyPoints(body);

    return res.json(result);
});

router.post("/charge", async (req, res) => {

    let body = req.body;
    let uid = req.uinfo["u"];
    let result;

    if (!_util.hasKeys(body, "merchant_uid", "imp_uid")) {
        // console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (_util.isBlanks(body.merchant_uid, body.imp_uid)) {
        // console.log("blank");
        return res.send(jresp.invalidData());
    }

    let impUid = body.imp_uid;
    let orderNum = body.merchant_uid;

    /* pg ??? ?????? ?????? */
    let pgOrder = await _import.getPaymentData(impUid);

    if (!pgOrder.success) {

        /// pg ?????? ?????? 2003
        return res.json(jresp.failInquiryDataFromPG());
    }

    // console.log(pgOrder)

    /* db ?????? ?????? */
    let dbOrder = await pointSv.getPointInfoByOrderNum(orderNum);

    if (!dbOrder) {
        /// db ?????? ?????? 2004
        return res.json(jresp.failInquiryDataFromDB());
    }

    // console.log(dbOrder);

    ///  ?????? ?????? ?????? ??? ??????
    if (Number(pgOrder.amount) === Number(dbOrder.payment_price)) {

        /* status (string): ????????????.

        ready:?????????,
        paid:????????????,
        cancelled:????????????,
        failed:????????????     */


        switch (pgOrder["status"]) {

            // ?????? ??????.
            case "paid":

                // console.log("paid")

                let data = {
                    id : dbOrder.id,
                    pg_id : impUid,
                    user_id : dbOrder.user_id,
                    points : pgOrder["amount"],
                    card_name: pgOrder["card_name"],
                    card_number: pgOrder["card_number"]
                }

                // ?????? ?????? ???????????? ??????
                let result = await pointSv.successCharge(data);

                // ????????? ????????? sql ????????? ????????? ?????? ????????????.
                if (!result["success"]) {
                    return res.json(jresp.failPayment());
                }

                return res.json(jresp.successData());

            // ?????? ?????? ??????.
           /*case "ready":
               break;

            case "cancelled":
                break;

            case "failed":
                break;*/

            default:
                return res.json(jresp.invalidPaymentData());
        }
    }

    /// ?????? ????????? ?????? ??????
    else {

        switch (pgOrder["status"]) {

            // ?????? ?????? : ????????? ??????????????? ????????? ?????? ?????? ???????????????.
            case "paid":

                let reason = "?????? ???????????? ???????????? ?????? ?????? ??????";
                let chkSum = pgOrder["amount"];

                let data = {
                    "imp_uid" : pgOrder["imp_uid"],
                    "merchant_uid" : pgOrder["merchant_uid"],
                    "amount": pgOrder["amount"], // ????????? ???????????????????????? ?????? ????????????
                    "checksum": chkSum, // ?????? ?????? ??????
                    "reason": reason,
                }

                let result = await _import.refund(data)

                console.log(result, "refund")

                console.log(result["success"])

                if (!result["success"]) {
                    // "?????? ?????? ?????? ????????? ?????? ?????? ??????");

                    return res.json(jresp.errorFromProcessingInvalidData())
                }

                // ("?????? ?????? ?????? ????????? ?????? ?????? ??????");
                return res.json(jresp.successFromProcessingInvalidData());

            // ?????? ?????? ??????.
            /*case "ready":
                break;

             case "cancelled":
                 break;

             case "failed":
                 break;*/

            default:
                console.log("fail ")
                return res.json(jresp.invalidPaymentData());

        }
    }
});


router.post("/charge/webhook", async (req, res) => {

    let body = req.body;
    // let uid = req.uinfo["u"];
    // let result;

    if (!_util.hasKeys(body, "merchant_uid", "imp_uid")) {
        console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (_util.isBlanks(body.merchant_uid, body.imp_uid)) {
        console.log("blank");
        return res.send(jresp.invalidData());
    }

    let impUid = body.imp_uid;
    let orderNum = body.merchant_uid;

    /* pg ??? ?????? ?????? */
    let pgOrder = await _import.getPaymentData(impUid);

    if (!pgOrder.success) {

        /// pg ?????? ?????? 2003
        return res.json(jresp.failInquiryDataFromPG());
    }

    /* db ?????? ?????? */
    let dbOrder = await pointSv.getPointInfoByOrderNum(orderNum);

    if (!dbOrder) {
        /// db ?????? ?????? 2004
        return res.json(jresp.failInquiryDataFromDB());
    }


    ///  ?????? ?????? ?????? ??? ??????
    if (Number(pgOrder.amount) === Number(dbOrder.payment_price)) {

        /* status (string): ????????????.

        ready:?????????,
        paid:????????????,
        cancelled:????????????,
        failed:????????????     */


        switch (pgOrder["status"]) {


            // ?????? ??????.
            case "paid":

                console.log("paid")

                let data = {
                    id : dbOrder.id,
                    pg_id : impUid,
                    user_id : dbOrder.user_id,
                    points : pgOrder["amount"],
                    card_name: pgOrder["card_name"],
                    card_number: pgOrder["card_number"]
                }

                // ?????? ?????? ???????????? ??????
                let result = await pointSv.successCharge(data);

                if (!result["success"]) {
                    return res.json(jresp.failPayment());
                }

                result= await pointSv.chargePoints(data);

                // ????????? ????????? sql ????????? ????????? ?????? ????????????.
                if (!result["success"]) {
                    return res.json(jresp.failPayment());
                }

                return res.json(jresp.successData());

            // ?????? ?????? ??????.
            /*case "ready":
                break;

             case "cancelled":
                 break;

             case "failed":
                 break;*/

            default:
                return res.json(jresp.invalidPaymentData());
        }
    }

    /// ?????? ????????? ?????? ??????
    else {

        switch (pgOrder["status"]) {

            // ?????? ?????? : ????????? ??????????????? ????????? ?????? ?????? ???????????????.
            case "paid":

                let reason = "?????? ???????????? ???????????? ?????? ?????? ??????";
                let chkSum = pgOrder["amount"];

                let data = {
                    "imp_uid" : pgOrder["imp_uid"],
                    "merchant_uid" : pgOrder["merchant_uid"],
                    "amount": pgOrder["amount"], // ????????? ???????????????????????? ?????? ????????????
                    "checksum": chkSum, // ?????? ?????? ??????
                    "reason": reason,
                }

                let result = await _import.refund(data)

                if (!result["success"]) {
                    // "?????? ?????? ?????? ????????? ?????? ?????? ??????");

                    return res.json(jresp.errorFromProcessingInvalidData)
                }

                // ("?????? ?????? ?????? ????????? ?????? ?????? ??????");
                return res.json(jresp.successFromProcessingInvalidData);

            // ?????? ?????? ??????.
            /*case "ready":
                break;

             case "cancelled":
                 break;

             case "failed":
                 break;*/

            default:
                console.log("fail ")
                return res.json(jresp.invalidPaymentData());

        }
    }
});

router.get("/had/total", async (req, res) => {

    let uid = req.uinfo["u"];
    let item = await pointSv.getTotalPointsByUserId(uid);

    if (!item) {
        return res.json(jresp.sqlError())
    }

    delete item.total_sponsored;

    return res.json(jresp.successData(item))
});

router.get("/sponsored/total", async (req, res) => {

    let uid = req.uinfo["u"];
    let item = await pointSv.getTotalPointsByUserId(uid);

    if (!item) {
        return res.json(jresp.sqlError())
    }

    delete item.total_points;

    return res.json(jresp.successData(item))
});

router.get("/all/total", async (req, res) => {

    let uid = req.uinfo["u"];
    let item = await pointSv.getTotalPointsByUserId(uid);

    if (!item) {
        return res.json(jresp.sqlError())
    }

    return res.json(jresp.successData(item))
});


router.post("/sponsor/video", async (req, res) => {

    let body = req.body;
    let uid = req.uinfo["u"];
    let msg = `possible between ${_util.commaMoney(minSponsorPoints)} and ${_util.commaMoney(maxSponsorPoints)}`;
    let sponsorLimit = {
        min: minSponsorPoints,
        max: maxSponsorPoints
    }

    let result;

    if (!_util.hasKeys(body, "point_quantity", "video_post_id", "receiver")) {
        console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (!_util.areBeyondZero(body.point_quantity, body.video_post_id, body.receiver)) {
        console.log("not num");
        return res.json(jresp.invalidData());
    }

    // 1000 ?????? ??????
    if (Number(body.point_quantity) < minSponsorPoints) {
        console.log("invalid price");
        return res.send(jresp.invalidData(msg, sponsorLimit));
    }

    // ?????? ?????? ??????
    if (Number(body.point_quantity) > maxSponsorPoints) {
        console.log("invalid price");
        return res.send(jresp.invalidData(msg, sponsorLimit));
    }

    // ?????? ?????? ????????? ??????
    let dailySponsored = await pointSv.getDailySponsorPointsByUserId(uid);
    let possibleDailySponsor = dailySponsorMaxPoints - dailySponsored;

    console.log(dailySponsored);
    console.log(possibleDailySponsor);

    if (Number(body.point_quantity) > possibleDailySponsor) {
        console.log("invalid price");

        let data = {
            "daily_sponsor_limit": dailySponsorMaxPoints,
            "possible_sponsor": possibleDailySponsor
        }

        return res.send(jresp.beyondSomething("beyond daily sponsor points", data))
    }

    /// ????????? ????????? ??????
    let points = await pointSv.getTotalPointsByUserId(uid);
    // let appliedAdjustmentTotal = await pointSv.getTotalAppliedAdjustmentByUserId(uid, 0);
    let appliedAdjustmentTotal = 0;

    console.log("totalPoints", points);
    console.log("totalPoints", points.total_points);
    console.log("adjustment", appliedAdjustmentTotal);

    let possibleSponsorPoints = points.total_points - appliedAdjustmentTotal;

    if (possibleSponsorPoints < 0) {
        console.log("total select fail")
        return res.send(jresp.sqlError());
    }

    if (possibleSponsorPoints < body.point_quantity) {
        console.log("short point")

        let data = {
            "own_points": possibleSponsorPoints
        }

        return res.json(jresp.underSomething("short of your points", data));
    }

    body.user_id = uid;

    result = await pointSv.sponsorPoints(body);

    // fcm ?????????.
    await notifySv.notifySponsorVideo(uid, body.video_post_id);

    return res.json(result);

});

router.post("/sponsor/creator", async (req, res) => {

    let body = req.body;
    let uid = req.uinfo["u"];
    let msg = `possible between ${_util.commaMoney(minSponsorPoints)} and ${_util.commaMoney(maxSponsorPoints)}`;
    let sponsorLimit = {
        min: minSponsorPoints,
        max: maxSponsorPoints
    }

    let result;

    if (!_util.hasKeys(body, "point_quantity", "receiver")) {
        console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (!_util.areBeyondZero(body.point_quantity, body.receiver)) {
        console.log("not num");
        return res.json(jresp.invalidData());
    }

    if (Number(body.point_quantity) < minSponsorPoints) {
        console.log("invalid price");
        return res.send(jresp.invalidData(msg, sponsorLimit));
    }

    // ?????? ?????? ??????
    if (Number(body.point_quantity) > maxSponsorPoints) {
        console.log("invalid price");
        return res.send(jresp.invalidData(msg, sponsorLimit));
    }

    // ?????? ?????? ????????? ??????
    let dailySponsored = await pointSv.getDailySponsorPointsByUserId(uid);
    let possibleDailySponsor = dailySponsorMaxPoints - dailySponsored;

    console.log(dailySponsored);
    console.log(possibleDailySponsor);

    if (Number(body.point_quantity) > possibleDailySponsor) {
        console.log("invalid price");

        let data = {
            "daily_sponsor_limit": dailySponsorMaxPoints,
            "possible_sponsor": possibleDailySponsor
        }

        return res.send(jresp.beyondSomething("beyond daily sponsor points", data))
    }

    /// ????????? ????????? ??????
    let points = await pointSv.getTotalPointsByUserId(uid);
    // let appliedAdjustmentTotal = await pointSv.getTotalAppliedAdjustmentByUserId(uid, 0);
    let appliedAdjustmentTotal = 0;

    console.log("totalPoints", points);
    console.log("totalPoints", points.total_points);
    console.log("adjustment", appliedAdjustmentTotal);

    let possibleSponsorPoints = points.total_points - appliedAdjustmentTotal;

    if (possibleSponsorPoints < 0) {
        console.log("total select fail")
        return res.send(jresp.sqlError());
    }

    if (possibleSponsorPoints < body.point_quantity) {
        console.log("short point")

        let data = {
            "own_points": possibleSponsorPoints
        }

        return res.json(jresp.underSomething("short of your points", data));
    }

    body.user_id = uid;

    result = await pointSv.sponsorPoints(body);

    // fcm ?????????.
    await notifySv.notifySponsorCreator(uid, body.receiver);

    return res.json(result);
});

/// ????????? ??????
router.get("/history", async (req, res) => {

    let uid = req.uinfo["u"];
    let limit = req.query.limit;
    let offset = req.query.offset;

    let result = ""

    if (!_util.areBeyondZero(limit, offset)) {
        return res.json(jresp.invalidData());
    }

    result = await pointSv.getPointHistoryByUserId(uid, limit, offset);

    return res.json(result);
});


/// ?????? ??????
router.get("/history/sponsor/video", async (req, res) => {

    let uid = req.uinfo["u"];
    let limit = req.query.limit;
    let offset = req.query.offset;

    if (!_util.areBeyondZero(limit, offset)) {
        return res.json(jresp.invalidData());
    }

    let result = await pointSv.getSponsorVideoHistoryByUserId(uid, limit, offset);

    return res.json(result);
});


router.get("/history/sponsor/creator", async (req, res) => {

    let uid = req.uinfo["u"];
    let limit = req.query.limit;
    let offset = req.query.offset;

    if (!_util.areBeyondZero(limit, offset)) {
        return res.json(jresp.invalidData());
    }

    let result = await pointSv.getSponsorCreatorHistoryByUserId(uid, limit, offset);

    return res.json(result);
});


/*
    ?????? ??????
*/

// ?????? ??????
router.get("/history/adjustment", async (req, res) => {

    let uid = req.uinfo["u"];
    let limit = req.query.limit;
    let offset = req.query.offset;

    if (!_util.areBeyondZero(limit, offset)) {
        return res.json(jresp.invalidData());
    }

    let result = await pointSv.getAdjustmentHistoryByUserId(uid, limit, offset);

    return res.json(result);
});

// ?????? ??????
/// ?????? ?????????
router.post("/apply/charge/adjustment", async (req, res) => {

    let body = req.body
    let uid = req.uinfo["u"];
    let result;

    if (!_util.hasKeys(body, "point_quantity", "account")) {
        console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (_util.isBlank(body.account)) {
        console.log("blank");
        return res.json(jresp.invalidData());
    }

    if (!_util.isBeyondZero(body.point_quantity)) {
        console.log("not num");
        return res.json(jresp.invalidData());
    }

    /// ?????? ?????? ?????? ??????
    if (Number(body.point_quantity) < minAdjustmentPoints) {
        console.log("under 5000");

        let msg = `under ${_util.commaMoney(minAdjustmentPoints)} points`

        return res.send(jresp.invalidData(msg, {min: minAdjustmentPoints}));
    }

    if (Number(body.point_quantity) % 100 > 0) {
        console.log("only 100");
        return res.send(jresp.invalidData("only 100 units or more"));
    }

    let points = await pointSv.getTotalPointsByUserId(uid);
    // let appliedTotal = await pointSv.getTotalAppliedAdjustmentByUserId(uid, 0);
    let appliedTotal = 0;

    console.log("totalPoints", points.total_points);
    console.log("appliedTotal", appliedTotal);
    console.log("total", points.total_points - appliedTotal);

    let possibleAdjustmentPoint = points.total_points - appliedTotal;

    if (points.total_points < 0 || appliedTotal < 0) {
        console.log("total select fail")
        return res.send(jresp.sqlError());
    }

    if (possibleAdjustmentPoint < body.point_quantity) {

        console.log("beyond possible  points to apply")

        let data = {
            "own_charge_points": points.total_points,
            "applied_points": appliedTotal,
            "possible": possibleAdjustmentPoint
        }
        return res.json(jresp.beyondSomething("beyond possible points to apply", data));
    }

    body.user_id = uid;
    body.point_type = 0;

    result = await pointSv.applyAdjustment(body);

    return res.json(result);
});

/// ?????? ?????????
router.post("/apply/sponsor/adjustment", async (req, res) => {

    let body = req.body
    let uid = req.uinfo["u"];
    let result;

    if (!_util.hasKeys(body, "point_quantity", "account")) {
        console.log("not key");
        return res.json(jresp.invalidData());
    }

    if (_util.isBlank(body.account)) {
        console.log("blank");
        return res.json(jresp.invalidData());
    }

    if (!_util.isBeyondZero(body.point_quantity)) {
        console.log("not num");
        return res.json(jresp.invalidData());
    }

    if (Number(body.point_quantity) < minAdjustmentPoints) {
        console.log("under 5000");

        let msg = `under ${_util.commaMoney(minAdjustmentPoints)} points`
        return res.send(jresp.invalidData(msg, {min: minAdjustmentPoints}));
    }

    if (Number(body.point_quantity) % 100 > 0) {
        console.log("only 100 units");
        return res.send(jresp.invalidData("only 100 units or more"));
    }

    let points = await pointSv.getTotalPointsByUserId(uid);
    // let appliedTotal = await pointSv.getTotalAppliedAdjustmentByUserId(uid, 1);
    let appliedTotal = 0;

    console.log("total_sponsored", points.total_sponsored);
    console.log("appliedTotal", appliedTotal);
    console.log("total", points.total_sponsored - appliedTotal);

    let possibleAdjustmentPoint = points.total_sponsored - appliedTotal;

    if (points.total_sponsored < 0 || appliedTotal < 0) {
        console.log("total select fail")
        return res.send(jresp.sqlError());
    }

    if (possibleAdjustmentPoint < body.point_quantity) {
        console.log("beyond possible  points to apply")

        let data = {
            "own_sponsor_points": points.total_sponsored,
            "applied_points": appliedTotal,
            "possible": possibleAdjustmentPoint
        }
        return res.json(jresp.beyondSomething("beyond possible points to apply", data));
    }

    body.user_id = uid;
    body.point_type = 1;

    result = await pointSv.applyAdjustment(body);

    return res.json(result);
});


module.exports = router;